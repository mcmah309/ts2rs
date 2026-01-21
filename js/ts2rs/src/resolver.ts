/**
 * TypeScript type resolver using ts-morph
 * Traverses TypeScript types and resolves them to intermediate representation
 */

import {
  Project,
  SourceFile,
  Type,
  TypeAliasDeclaration,
  InterfaceDeclaration,
  EnumDeclaration,
  Node,
  SyntaxKind,
  PropertySignature,
  ts,
} from "ts-morph";
import type {
  ResolvedType,
  CollectedType,
  StructType,
  EnumType,
  StructField,
  EnumVariant,
  UnionType,
  UnionVariant,
  ConversionOptions,
  TypeAliasType,
} from "./types";
import { TypeConversionError } from "./types";

/**
 * Resolves TypeScript types to intermediate representation for Rust code generation
 */
export class TypeResolver {
  private project: Project;
  private collectedTypes: Map<string, CollectedType> = new Map();
  private processingTypes: Set<string> = new Set(); // For cycle detection
  private typeParameters: Set<string> = new Set(); // Track current type parameters
  private options: ConversionOptions;
  private warnings: string[] = []; // Track warnings during resolution

  constructor(options: ConversionOptions) {
    this.options = options;
    const tsConfigPath = this.findTsConfig(options.entryFile);
    this.project = new Project({
      tsConfigFilePath: tsConfigPath,
      // Don't skip tsconfig files - we need them for module resolution
      skipAddingFilesFromTsConfig: false,
      compilerOptions: {
        // Enable strictNullChecks to properly handle T | null unions
        strictNullChecks: true,
      },
    });
    // Make sure the entry file is in the project
    if (!this.project.getSourceFile(options.entryFile)) {
      this.project.addSourceFilesAtPaths(options.entryFile);
    }
  }

  private findTsConfig(entryFile: string): string | undefined {
    const configPath = ts.findConfigFile(
      entryFile,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    return configPath;
  }

  /**
   * Resolve all types from the entry file
   */
  resolve(): CollectedType[] {
    const sourceFile = this.project.getSourceFileOrThrow(this.options.entryFile);

    if (this.options.typeNames && this.options.typeNames.length > 0) {
      for (const typeName of this.options.typeNames) {
        this.resolveTypeByName(sourceFile, typeName);
      }
    } else {
      this.resolveAllExportedTypes(sourceFile);
    }

    return Array.from(this.collectedTypes.values());
  }

  /**
   * Get all warnings generated during resolution
   */
  getWarnings(): string[] {
    return this.warnings;
  }

  /**
   * Handle falling back to serde_json::Value
   * In strict mode, this throws an error. Otherwise, it logs a warning and returns JsonValueType.
   */
  private handleValueFallback(
    reason: string,
    type?: Type,
    sourceFile?: string,
  ): ResolvedType {
    const message = `Falling back to serde_json::Value: ${reason}${sourceFile ? ` (in ${sourceFile})` : ""}${type ? ` (type: ${type.getText()})` : ""}`;
    
    if (this.options.strict) {
      throw new TypeConversionError(
        type?.getText() ?? "unknown",
        reason,
        sourceFile,
      );
    }
    
    this.warnings.push(message);
    return { kind: "json_value" };
  }

  private resolveAllExportedTypes(sourceFile: SourceFile): void {
    const exportedDeclarations = sourceFile.getExportedDeclarations();

    for (const [name, declarations] of exportedDeclarations) {
      for (const decl of declarations) {
        if (
          Node.isInterfaceDeclaration(decl) ||
          Node.isTypeAliasDeclaration(decl) ||
          Node.isEnumDeclaration(decl)
        ) {
          this.resolveTypeByName(sourceFile, name);
        }
      }
    }
  }

  private resolveTypeByName(sourceFile: SourceFile, typeName: string): void {
    if (this.collectedTypes.has(typeName)) {
      return; // Already resolved
    }

    if (this.processingTypes.has(typeName)) {
      return; // Cycle detected, skip
    }

    const declaration = this.findTypeDeclaration(sourceFile, typeName);
    if (!declaration) {
      throw new TypeConversionError(
        typeName,
        "Type declaration not found",
        sourceFile.getFilePath(),
      );
    }

    this.processingTypes.add(typeName);

    try {
      if (Node.isInterfaceDeclaration(declaration)) {
        this.resolveInterface(declaration);
      } else if (Node.isTypeAliasDeclaration(declaration)) {
        this.resolveTypeAlias(declaration);
      } else if (Node.isEnumDeclaration(declaration)) {
        this.resolveEnum(declaration);
      }
    } finally {
      this.processingTypes.delete(typeName);
    }
  }

  private findTypeDeclaration(
    sourceFile: SourceFile,
    typeName: string,
  ): InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration | undefined {
    // First check in the current file
    let decl =
      sourceFile.getInterface(typeName) ||
      sourceFile.getTypeAlias(typeName) ||
      sourceFile.getEnum(typeName);

    if (decl) {
      return decl;
    }

    // Check in imported files
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();

      if (resolvedSourceFile) {
        const namedImports = importDecl.getNamedImports();
        for (const namedImport of namedImports) {
          if (namedImport.getName() === typeName) {
            decl =
              resolvedSourceFile.getInterface(typeName) ||
              resolvedSourceFile.getTypeAlias(typeName) ||
              resolvedSourceFile.getEnum(typeName);
            if (decl) {
              return decl;
            }
          }
        }
      }
    }

    // Also search through project source files
    for (const sf of this.project.getSourceFiles()) {
      decl = sf.getInterface(typeName) || sf.getTypeAlias(typeName) || sf.getEnum(typeName);
      if (decl) {
        return decl;
      }
    }

    return undefined;
  }

  private resolveInterface(declaration: InterfaceDeclaration): void {
    const name = declaration.getName();
    const fields: StructField[] = [];
    const typeParams = declaration.getTypeParameters().map((p) => p.getName());

    const previousTypeParams = new Set(this.typeParameters);
    typeParams.forEach((tp) => this.typeParameters.add(tp));

    try {
      for (const extendedType of declaration.getExtends()) {
        const baseType = extendedType.getType();
        const baseFields = this.extractFieldsFromType(baseType);
        fields.push(...baseFields);
      }

      for (const prop of declaration.getProperties()) {
        fields.push(this.resolveProperty(prop));
      }

      const structType: StructType = {
        kind: "struct",
        name,
        fields,
        documentation: this.getDocumentation(declaration),
        typeParameters: typeParams.length > 0 ? typeParams : undefined,
      };

      this.collectedTypes.set(name, {
        name,
        type: structType,
        sourceFile: declaration.getSourceFile().getFilePath(),
      });
    } finally {
      this.typeParameters = previousTypeParams;
    }
  }

  private extractFieldsFromType(type: Type): StructField[] {
    const fields: StructField[] = [];
    const properties = type.getProperties();

    for (const prop of properties) {
      const propDecl = prop.getDeclarations()[0];
      if (propDecl && Node.isPropertySignature(propDecl)) {
        fields.push(this.resolveProperty(propDecl));
      }
    }

    return fields;
  }

  private resolveProperty(prop: PropertySignature): StructField {
    const name = prop.getName();
    const isOptional = prop.hasQuestionToken();
    const type = prop.getType();

    let resolvedType = this.resolveType(type, prop.getSourceFile());

    // Check for direct recursive reference that needs Box wrapping
    // A recursive reference needs Box if:
    // 1. It's a struct reference to a type being processed
    // 2. It's not already wrapped in Option or Array (which provide indirection)
    if (resolvedType.kind === "struct" && resolvedType.name && this.processingTypes.has(resolvedType.name)) {
      resolvedType = {
        kind: "box",
        innerType: resolvedType,
      };
    }

    if (isOptional && resolvedType.kind !== "option") {
      resolvedType = {
        kind: "option",
        innerType: resolvedType,
      };
    }

    return {
      name,
      type: resolvedType,
      optional: isOptional,
      documentation: this.getDocumentation(prop),
    };
  }

  private resolveTypeAlias(declaration: TypeAliasDeclaration): void {
    const name = declaration.getName();
    const type = declaration.getType();

    // Check for tuple types first (before object check, since tuples are objects)
    if (type.isTuple()) {
      const tupleTypes = type.getTupleElements();
      const aliasType: TypeAliasType = {
        kind: "type_alias",
        name,
        aliasedType: {
          kind: "tuple",
          elements: tupleTypes.map((t) => this.resolveType(t, declaration.getSourceFile())),
        },
        documentation: this.getDocumentation(declaration),
      };
      
      this.collectedTypes.set(name, {
        name,
        type: aliasType,
        sourceFile: declaration.getSourceFile().getFilePath(),
      });
      return;
    }

    // Check if it's an object type that should become a struct
    if (type.isObject() && !type.isArray() && !this.isBuiltInType(type)) {
      const properties = type.getProperties();
      if (properties.length > 0) {
        const fields: StructField[] = [];

        for (const prop of properties) {
          const propDecls = prop.getDeclarations();
          const propDecl = propDecls[0];

          let isOptional = false;
          let propType: Type;
          let documentation: string | undefined;
          let typeNode: Node | undefined;

          if (propDecl && Node.isPropertySignature(propDecl)) {
            isOptional = propDecl.hasQuestionToken();
            documentation = this.getDocumentation(propDecl);
            // Get the type from the property signature directly to preserve unions with null
            propType = propDecl.getType();
            typeNode = propDecl.getTypeNode();
          } else {
            propType = prop.getTypeAtLocation(declaration);
          }

          let resolvedType = this.resolveTypeWithNode(propType, declaration.getSourceFile(), typeNode);

          if (isOptional && resolvedType.kind !== "option") {
            resolvedType = {
              kind: "option",
              innerType: resolvedType,
            };
          }

          fields.push({
            name: prop.getName(),
            type: resolvedType,
            optional: isOptional,
            documentation,
          });
        }

        const structType: StructType = {
          kind: "struct",
          name,
          fields,
          documentation: this.getDocumentation(declaration),
        };

        this.collectedTypes.set(name, {
          name,
          type: structType,
          sourceFile: declaration.getSourceFile().getFilePath(),
        });
        return;
      }
    }

    if (type.isUnion()) {
      const unionTypes = type.getUnionTypes();
      
      if (this.isDiscriminatedUnion(unionTypes, declaration.getSourceFile())) {
        const unionType = this.resolveDiscriminatedUnion(name, unionTypes, declaration);
        this.collectedTypes.set(name, {
          name,
          type: unionType,
          sourceFile: declaration.getSourceFile().getFilePath(),
        });
        return;
      }

      if (this.isLiteralUnion(unionTypes)) {
        const enumType = this.resolveLiteralUnionAsEnum(name, unionTypes, declaration);
        this.collectedTypes.set(name, {
          name,
          type: enumType,
          sourceFile: declaration.getSourceFile().getFilePath(),
        });
        return;
      }

      const unionType = this.resolveUnionType(name, unionTypes, declaration);
      
      // If the union has unresolvable types, don't collect it
      // It will be used as Value in other types
      if (unionType === null) {
        this.warnings.push(
          `Union type '${name}' has unresolvable variants and will be used as serde_json::Value in other types (at ${declaration.getSourceFile().getFilePath()})`
        );
        return;
      }
      
      this.collectedTypes.set(name, {
        name,
        type: unionType,
        sourceFile: declaration.getSourceFile().getFilePath(),
      });
      return;
    }

    const resolvedType = this.resolveType(type, declaration.getSourceFile());
    
    // If the resolved type is a struct/enum with a different name, create a type alias struct
    if (resolvedType.kind === "struct" || resolvedType.kind === "enum" || resolvedType.kind === "union") {
      this.collectedTypes.set(name, {
        name,
        type: resolvedType as StructType | EnumType | UnionType,
        sourceFile: declaration.getSourceFile().getFilePath(),
      });
    }
  }

  private resolveEnum(declaration: EnumDeclaration): void {
    const name = declaration.getName();
    const members = declaration.getMembers();
    const variants: EnumVariant[] = [];
    let isStringEnum = false;

    for (const member of members) {
      const memberName = member.getName();
      const value = member.getValue();

      if (typeof value === "string") {
        isStringEnum = true;
      }

      variants.push({
        name: memberName,
        value: value,
        documentation: this.getDocumentation(member),
      });
    }

    const enumType: EnumType = {
      kind: "enum",
      name,
      variants,
      isStringEnum,
      documentation: this.getDocumentation(declaration),
    };

    this.collectedTypes.set(name, {
      name,
      type: enumType,
      sourceFile: declaration.getSourceFile().getFilePath(),
    });
  }

  /**
   * Resolve a type with optional type node for better accuracy.
   * The type node preserves the original syntax which helps with unions like `TypeAlias | null`
   */
  private resolveTypeWithNode(type: Type, sourceFile: SourceFile, typeNode?: Node): ResolvedType {
    // If we have a type node and it's a union, check for TypeReference | null pattern
    if (typeNode && typeNode.getKind() === SyntaxKind.UnionType) {
      const unionTypeNode = typeNode.asKind(SyntaxKind.UnionType);
      if (unionTypeNode) {
        const typeNodes = unionTypeNode.getTypeNodes();
        const nullNodes = typeNodes.filter(n => 
          n.getKind() === SyntaxKind.LiteralType && n.getText() === "null"
        );
        const nonNullNodes = typeNodes.filter(n => 
          !(n.getKind() === SyntaxKind.LiteralType && n.getText() === "null")
        );

        // Pattern: TypeReference | null => Option<TypeReference>
        if (nullNodes.length > 0 && nonNullNodes.length === 1) {
          const nonNullNode = nonNullNodes[0]!;
          
          // If it's a type reference, resolve it by name
          if (nonNullNode.getKind() === SyntaxKind.TypeReference) {
            const typeRef = nonNullNode.asKind(SyntaxKind.TypeReference);
            if (typeRef) {
              const typeName = typeRef.getTypeName().getText();
              const declaration = this.findTypeDeclaration(sourceFile, typeName);
              if (declaration) {
                this.resolveTypeByName(sourceFile, typeName);
                return {
                  kind: "option",
                  innerType: { kind: "struct", name: typeName, fields: [] },
                };
              }
            }
          }
          
          // If it's an array type like Array<T> | null
          if (nonNullNode.getKind() === SyntaxKind.TypeReference) {
            const typeRef = nonNullNode.asKind(SyntaxKind.TypeReference);
            if (typeRef) {
              const typeName = typeRef.getTypeName().getText();
              if (typeName === "Array") {
                const typeArgs = typeRef.getTypeArguments();
                if (typeArgs.length > 0) {
                  const elementTypeNode = typeArgs[0]!;
                  const elementType = this.resolveTypeFromNode(elementTypeNode, sourceFile);
                  return {
                    kind: "option",
                    innerType: { kind: "array", elementType },
                  };
                }
              }
            }
          }
          
          // If it's ArrayType syntax like T[] | null
          if (nonNullNode.getKind() === SyntaxKind.ArrayType) {
            const arrayTypeNode = nonNullNode.asKind(SyntaxKind.ArrayType);
            if (arrayTypeNode) {
              const elementTypeNode = arrayTypeNode.getElementTypeNode();
              const elementType = this.resolveTypeFromNode(elementTypeNode, sourceFile);
              return {
                kind: "option",
                innerType: { kind: "array", elementType },
              };
            }
          }
        }
      }
    }
    
    // Fall back to resolving from the Type object
    return this.resolveType(type, sourceFile);
  }

  /**
   * Resolve a type from a type node directly
   */
  private resolveTypeFromNode(typeNode: Node, sourceFile: SourceFile): ResolvedType {
    if (typeNode.getKind() === SyntaxKind.TypeReference) {
      const typeRef = typeNode.asKind(SyntaxKind.TypeReference);
      if (typeRef) {
        const typeName = typeRef.getTypeName().getText();
        
        if (typeName === "Array") {
          const typeArgs = typeRef.getTypeArguments();
          if (typeArgs.length > 0) {
            return {
              kind: "array",
              elementType: this.resolveTypeFromNode(typeArgs[0]!, sourceFile),
            };
          }
        }
        
        // Try to resolve as a local type
        const declaration = this.findTypeDeclaration(sourceFile, typeName);
        if (declaration) {
          this.resolveTypeByName(sourceFile, typeName);
          return { kind: "struct", name: typeName, fields: [] };
        }
        
        return this.resolveImportedType(typeName, sourceFile);
      }
    }
    
    // Handle basic types
    const text = typeNode.getText();
    if (text === "string") return { kind: "primitive", type: "string" };
    if (text === "number") return { kind: "primitive", type: "number" };
    if (text === "boolean") return { kind: "primitive", type: "boolean" };
    
    // Fall back to resolving via the type checker
    const type = typeNode.getType();
    return this.resolveType(type, sourceFile);
  }

  /**
   * Resolve an imported type by its name
   */
  private resolveImportedType(typeName: string, sourceFile: SourceFile): ResolvedType {
    // Look for the import declaration
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        if (namedImport.getName() === typeName) {
          const moduleSourceFile = importDecl.getModuleSpecifierSourceFile();
          if (moduleSourceFile) {
            this.project.addSourceFileAtPath(moduleSourceFile.getFilePath());

            const declaration = this.findTypeDeclaration(moduleSourceFile, typeName);
            if (declaration) {
              this.resolveTypeByName(moduleSourceFile, typeName);
              
              // Check if the type was actually collected
              if (!this.collectedTypes.has(typeName)) {
                return this.handleValueFallback(
                  `Type '${typeName}' could not be fully resolved`,
                  undefined,
                  sourceFile.getFilePath(),
                );
              }
              
              return { kind: "struct", name: typeName, fields: [] };
            }
          }
        }
      }
    }
    
    // Could not resolve, return json_value
    return this.handleValueFallback(
      "Type could not be resolved",
      undefined,
      sourceFile.getFilePath(),
    );
  }

  private resolveType(type: Type, sourceFile: SourceFile): ResolvedType {
    // Check for type parameters first - they cannot be resolved as concrete types
    if (type.isTypeParameter()) {
      const typeParamName = type.getSymbol()?.getName();
      return this.handleValueFallback(
        `Type parameter '${typeParamName ?? "unknown"}' cannot be resolved to concrete type`,
        type,
        sourceFile.getFilePath(),
      );
    }

    // Check for type aliases - if the type is an alias to something,
    // we should resolve the alias, not the underlying type
    // But skip for built-in aliases
    const aliasSymbol = type.getAliasSymbol();
    if (aliasSymbol && !this.isBuiltInAlias(aliasSymbol.getName())) {
      const aliasName = aliasSymbol.getName();
      
      // Skip if it's a type parameter we're tracking
      if (this.typeParameters.has(aliasName)) {
        return this.handleValueFallback(
          `Type parameter '${aliasName}' cannot be resolved to concrete type`,
          type,
          sourceFile.getFilePath(),
        );
      }
      
      const decl = aliasSymbol.getDeclarations()?.[0];
      if (decl) {
        const declSourceFile = decl.getSourceFile();
        
        if (!this.project.getSourceFile(declSourceFile.getFilePath())) {
          this.project.addSourceFileAtPath(declSourceFile.getFilePath());
        }
        
        this.resolveTypeByName(declSourceFile, aliasName);
        
        if (this.collectedTypes.has(aliasName) || this.processingTypes.has(aliasName)) {
          return {
            kind: "struct",
            name: aliasName,
            fields: [],
          };
        }
      }
    }

    if (type.isNull()) {
      return { kind: "primitive", type: "null" };
    }

    if (type.isUndefined()) {
      return { kind: "primitive", type: "undefined" };
    }

    // Note: Type parameter check is done earlier before alias check

    if (type.isString() || type.isStringLiteral()) {
      return { kind: "primitive", type: "string" };
    }

    if (type.isNumber() || type.isNumberLiteral()) {
      return { kind: "primitive", type: "number" };
    }

    if (type.isBoolean() || type.isBooleanLiteral()) {
      return { kind: "primitive", type: "boolean" };
    }

    if (type.isAny() || type.isUnknown()) {
      // Explicit any/unknown types are acceptable - no warning needed
      return { kind: "json_value" };
    }

    if (type.isStringLiteral()) {
      return { kind: "literal", value: type.getLiteralValue() as string };
    }

    if (type.isNumberLiteral()) {
      return { kind: "literal", value: type.getLiteralValue() as number };
    }

    if (type.isBooleanLiteral()) {
      const text = type.getText();
      return { kind: "literal", value: text === "true" };
    }

    if (type.isArray()) {
      const elementType = type.getArrayElementType();
      if (elementType) {
        return {
          kind: "array",
          elementType: this.resolveType(elementType, sourceFile),
        };
      }
    }

    if (type.isTuple()) {
      const tupleTypes = type.getTupleElements();
      return {
        kind: "tuple",
        elements: tupleTypes.map((t) => this.resolveType(t, sourceFile)),
      };
    }

    if (type.isUnion()) {
      return this.resolveInlineUnionType(type, sourceFile);
    }

    // Check for index signature types (Record<K, V> patterns)
    // Record<string, T> compiles to { [key: string]: T }
    const indexInfos = type.getStringIndexType();
    if (indexInfos && type.getProperties().length === 0) {
      return {
        kind: "record",
        keyType: { kind: "primitive", type: "string" },
        valueType: this.resolveType(indexInfos, sourceFile),
      };
    }

    const numberIndexType = type.getNumberIndexType();
    if (numberIndexType && type.getProperties().length === 0) {
      return {
        kind: "record",
        keyType: { kind: "primitive", type: "number" },
        valueType: this.resolveType(numberIndexType, sourceFile),
      };
    }

    // Check for object types with alias symbols (e.g., PackageJson.WorkspaceConfig)
    // This should be checked before generic symbol handling
    // Note: aliasSymbol was already checked at the start of resolveType, but that
    // check handles user-defined type aliases. This block handles special cases
    // for node_modules types that need different treatment.
    const nodeModulesAliasSymbol = type.getAliasSymbol();
    if (type.isObject() && nodeModulesAliasSymbol) {
      const aliasName = nodeModulesAliasSymbol.getName();
      const properties = type.getProperties();
      
      if (properties.length > 0) {
        const decl = nodeModulesAliasSymbol.getDeclarations()?.[0];
        
        if (decl) {
          const declSourceFile = decl.getSourceFile();
          const filePath = declSourceFile.getFilePath();
          
          // For types from node_modules, we need to check if this is a top-level
          // type declaration or a nested type (like PackageJson.WorkspaceConfig)
          if (this.isFromNodeModules(filePath)) {
            // Add the source file if not already added
            if (!this.project.getSourceFile(filePath)) {
              this.project.addSourceFileAtPath(filePath);
            }
            
            // Try to find if this is a top-level type
            const typeDecl = this.findTypeDeclaration(declSourceFile, aliasName);
            
            if (typeDecl) {
              // It's a top-level type, resolve it by name
              this.resolveTypeByName(declSourceFile, aliasName);
              
              return {
                kind: "struct",
                name: aliasName,
                fields: [],
              };
            } else {
              // It's a nested type (like PackageJson.WorkspaceConfig)
              // Create a unique name and collect it as a named type
              const uniqueName = aliasName;

              if (!this.collectedTypes.has(uniqueName)) {
                const fields: StructField[] = [];

                for (const prop of properties) {
                  const propDecl = prop.getDeclarations()[0];
                  let isOptional = false;
                  let propType = prop.getTypeAtLocation(sourceFile);

                  if (propDecl && Node.isPropertySignature(propDecl)) {
                    isOptional = propDecl.hasQuestionToken();
                  }

                  let resolvedType = this.resolveType(propType, sourceFile);

                  if (isOptional && resolvedType.kind !== "option") {
                    resolvedType = {
                      kind: "option",
                      innerType: resolvedType,
                    };
                  }

                  fields.push({
                    name: prop.getName(),
                    type: resolvedType,
                    optional: isOptional,
                  });
                }

                const structType: StructType = {
                  kind: "struct",
                  name: uniqueName,
                  fields,
                };

                this.collectedTypes.set(uniqueName, {
                  name: uniqueName,
                  type: structType,
                  sourceFile: filePath,
                });
              }

              return {
                kind: "struct",
                name: uniqueName,
                fields: [],
              };
            }
          }
        }
      }
    }

    // Handle type references (named types)
    const symbol = type.getSymbol() || type.getAliasSymbol();
    if (symbol) {
      const symbolName = symbol.getName();

      if (symbolName === "Array" || symbolName === "ReadonlyArray") {
        const typeArgs = type.getTypeArguments();
        if (typeArgs.length > 0 && typeArgs[0]) {
          return {
            kind: "array",
            elementType: this.resolveType(typeArgs[0], sourceFile),
          };
        }
      }

      if (symbolName === "Record") {
        const typeArgs = type.getTypeArguments();
        if (typeArgs.length >= 2 && typeArgs[0] && typeArgs[1]) {
          return {
            kind: "record",
            keyType: this.resolveType(typeArgs[0], sourceFile),
            valueType: this.resolveType(typeArgs[1], sourceFile),
          };
        }
      }

      if (symbolName === "Map") {
        const typeArgs = type.getTypeArguments();
        if (typeArgs.length >= 2 && typeArgs[0] && typeArgs[1]) {
          return {
            kind: "map",
            keyType: this.resolveType(typeArgs[0], sourceFile),
            valueType: this.resolveType(typeArgs[1], sourceFile),
          };
        }
      }

      if (symbolName === "Set") {
        const typeArgs = type.getTypeArguments();
        if (typeArgs.length > 0 && typeArgs[0]) {
          return {
            kind: "set",
            elementType: this.resolveType(typeArgs[0], sourceFile),
          };
        }
      }

      if (symbolName === "Date") {
        return { kind: "primitive", type: "string" }; // ISO 8601
      }

      if (symbolName === "Promise") {
        throw new TypeConversionError(
          "Promise",
          "Promise types cannot be serialized to JSON",
          sourceFile.getFilePath(),
        );
      }

      if (this.isInternalType(symbolName)) {
        // If it's an inline object type with __type symbol, handle it as an anonymous struct
        if (symbolName === "__type" && type.isObject() && type.getProperties().length > 0) {
        } else {
          return this.handleValueFallback(
            `Internal TypeScript type '${symbolName}' cannot be converted`,
            type,
            sourceFile.getFilePath(),
          );
        }
      } else if (!this.isBuiltInType(type)) {
        const decl = symbol.getDeclarations()?.[0];
        if (decl) {
          const declSourceFile = decl.getSourceFile();
          const filePath = declSourceFile.getFilePath();

          if (!this.isFromTypeScriptLib(filePath)) {
            if (!this.project.getSourceFile(filePath)) {
              this.project.addSourceFileAtPath(filePath);
            }

            this.resolveTypeByName(declSourceFile, symbolName);

            // Allow recursive references - if type is being processed, it will be collected later
            if (!this.collectedTypes.has(symbolName) && !this.processingTypes.has(symbolName)) {
              return this.handleValueFallback(
                `Type '${symbolName}' could not be fully resolved`,
                type,
                sourceFile.getFilePath(),
              );
            }
          } else {
            // For TypeScript lib types, return json_value
            return this.handleValueFallback(
              `TypeScript lib type '${symbolName}' from '${filePath}' cannot be resolved`,
              type,
              sourceFile.getFilePath(),
            );
          }
        }

        return {
          kind: "struct",
          name: symbolName,
          fields: [],
        };
      }
    }

    // Handle object types (inline objects)
    if (type.isObject() && !this.isBuiltInType(type)) {
      const properties = type.getProperties();
      
      if (properties.length > 0) {
        const fields: StructField[] = [];

        for (const prop of properties) {
          const propDecl = prop.getDeclarations()[0];
          let isOptional = false;
          let propType = prop.getTypeAtLocation(sourceFile);

          if (propDecl && Node.isPropertySignature(propDecl)) {
            isOptional = propDecl.hasQuestionToken();
          }

          let resolvedType = this.resolveType(propType, sourceFile);

          if (isOptional && resolvedType.kind !== "option") {
            resolvedType = {
              kind: "option",
              innerType: resolvedType,
            };
          }

          fields.push({
            name: prop.getName(),
            type: resolvedType,
            optional: isOptional,
          });
        }

        // Anonymous struct - will need to be handled specially in code generation
        return {
          kind: "struct",
          name: "",
          fields,
        };
      }
    }

    // Fallback to json value for complex types
    return this.handleValueFallback(
      "Complex type could not be resolved",
      type,
      sourceFile.getFilePath(),
    );
  }

  /**
   * Resolve inline union types (e.g., string | number | Type1 | Type2)
   * 
   * This method handles several patterns:
   * 1. Named type aliases that reference unions (resolve by name)
   * 2. T | null or T | undefined patterns (convert to Option<T>)
   * 3. Inline literal unions (cannot convert without a name)
   * 4. Other complex unions (fallback to json_value)
   */
  private resolveInlineUnionType(type: Type, sourceFile: SourceFile): ResolvedType {
    const unionTypes = type.getUnionTypes();

    // Check if this is actually a named type alias (not an inline union)
    const aliasSymbol = type.getAliasSymbol();
    if (aliasSymbol) {
      const typeName = aliasSymbol.getName();
      
      // This is a reference to a named type - resolve it properly
      const decl = aliasSymbol.getDeclarations()?.[0];
      if (decl) {
        const declSourceFile = decl.getSourceFile();
        const filePath = declSourceFile.getFilePath();

        if (!this.project.getSourceFile(filePath)) {
          this.project.addSourceFileAtPath(filePath);
        }

        const typeArgs = type.getAliasTypeArguments();
        if (typeArgs && typeArgs.length > 0) {
          // For generic types, we can't easily instantiate them in Rust
          // Fall through to handle as inline union
        } else {
          // Non-generic type alias - resolve it by name
          this.resolveTypeByName(declSourceFile, typeName);

          if (!this.collectedTypes.has(typeName)) {
            return this.handleValueFallback(
              `Type '${typeName}' could not be fully resolved`,
              type,
              sourceFile.getFilePath(),
            );
          }

          return {
            kind: "struct",  // Will be a union after resolution
            name: typeName,
            fields: [],
          };
        }
      }
    }

    // Check for T | null or T | undefined patterns (should become Option<T>)
    const nullOrUndefinedTypes = unionTypes.filter(
      (t) => t.isNull() || t.isUndefined(),
    );
    const nonNullTypes = unionTypes.filter(
      (t) => !t.isNull() && !t.isUndefined(),
    );

    if (nullOrUndefinedTypes.length > 0 && nonNullTypes.length === 1 && nonNullTypes[0]) {
      let innerType = this.resolveType(nonNullTypes[0], sourceFile);
      
      // Check for recursive reference that needs Box wrapping
      if (innerType.kind === "struct" && innerType.name && this.processingTypes.has(innerType.name)) {
        innerType = {
          kind: "box",
          innerType,
        };
      }
      
      return {
        kind: "option",
        innerType,
      };
    }

    if (nullOrUndefinedTypes.length > 0 && nonNullTypes.length > 1) {
      // Create a union without the null/undefined and wrap in Option
      // Since we have multiple non-null types, return json_value wrapped in Option
      return {
        kind: "option",
        innerType: { kind: "json_value" },
      };
    }

    if (this.isLiteralUnion(unionTypes)) {
      return this.handleValueFallback(
        "Inline literal union cannot be converted (must be a named type)",
        type,
        sourceFile.getFilePath(),
      );
    }

    return this.handleValueFallback(
      "Union type could not be resolved",
      type,
      sourceFile.getFilePath(),
    );
  }

  private isBuiltInType(type: Type): boolean {
    const aliasSymbol = type.getAliasSymbol();
    if (aliasSymbol) {
      // If there's an alias symbol, this is a named type alias, not a built-in
      return false;
    }

    const symbol = type.getSymbol();
    if (!symbol) return false;

    const name = symbol.getName();
    const builtInTypes = [
      "Array",
      "ReadonlyArray",
      "Record",
      "Map",
      "Set",
      "Date",
      "Promise",
      "Object",
      "Function",
      "String",
      "Number",
      "Boolean",
    ];
    return builtInTypes.includes(name);
  }

  private isInternalType(symbolName: string): boolean {
    // Skip internal TypeScript types
    return symbolName.startsWith("__") || symbolName === "Object" || symbolName === "Function";
  }

  /**
   * Check if an alias name is a built-in TypeScript type that should not be resolved as a custom type
   */
  private isBuiltInAlias(aliasName: string): boolean {
    const builtInAliases = [
      "Array",
      "ReadonlyArray",
      "Record",
      "Map",
      "Set",
      "Date",
      "Promise",
      "Partial",
      "Required",
      "Readonly",
      "Pick",
      "Omit",
      "Exclude",
      "Extract",
      "NonNullable",
      "ReturnType",
      "InstanceType",
      "Parameters",
    ];
    return builtInAliases.includes(aliasName);
  }

  /**
   * Check if a file path is from node_modules (excluding TypeScript lib)
   */
  private isFromNodeModules(filePath: string): boolean {
    return filePath.includes("node_modules") && !filePath.includes("node_modules/typescript/lib");
  }

  /**
   * Check if a file path is from TypeScript's built-in lib
   */
  private isFromTypeScriptLib(filePath: string): boolean {
    return filePath.includes("node_modules/typescript/lib");
  }

  /**
   * Check for literal union (string enum-like)
   */
  private isLiteralUnion(types: Type[]): boolean {
    return types.every(
      (t) =>
        t.isStringLiteral() ||
        t.isNumberLiteral() ||
        t.isBooleanLiteral() ||
        t.isNull() ||
        t.isUndefined(),
    );
  }

  private isDiscriminatedUnion(types: Type[], sourceFile: SourceFile): boolean {
    // Check if all types in the union have a common discriminant property
    if (types.length < 2) return false;

    const objectTypes = types.filter(
      (t) => t.isObject() && !t.isNull() && !t.isUndefined(),
    );
    if (objectTypes.length < 2) return false;

    const firstObjectType = objectTypes[0];
    if (!firstObjectType) return false;

    const firstProps = firstObjectType.getProperties().map((p) => p.getName());

    for (const propName of firstProps) {
      // Check if this property exists in all types and has literal values
      let isDiscriminant = true;

      for (const t of objectTypes) {
        const prop = t.getProperty(propName);
        if (!prop) {
          isDiscriminant = false;
          break;
        }

        const propType = prop.getTypeAtLocation(sourceFile);
        if (
          !propType.isStringLiteral() &&
          !propType.isNumberLiteral() &&
          !propType.isBooleanLiteral()
        ) {
          isDiscriminant = false;
          break;
        }
      }

      if (isDiscriminant) return true;
    }

    return false;
  }

  private resolveDiscriminatedUnion(
    name: string,
    types: Type[],
    declaration: TypeAliasDeclaration,
  ): UnionType {
    const sourceFile = declaration.getSourceFile();
    const objectTypes = types.filter(
      (t) => t.isObject() && !t.isNull() && !t.isUndefined(),
    );

    // Find the discriminant property
    let discriminantProp: string | undefined;
    const firstObjectType = objectTypes[0];
    if (!firstObjectType) {
      return {
        kind: "union",
        name,
        variants: [],
        documentation: this.getDocumentation(declaration),
      };
    }
    const firstProps = firstObjectType.getProperties().map((p) => p.getName());

    for (const propName of firstProps) {
      let isDiscriminant = true;

      for (const t of objectTypes) {
        const prop = t.getProperty(propName);
        if (!prop) {
          isDiscriminant = false;
          break;
        }

        const propType = prop.getTypeAtLocation(sourceFile);
        if (!propType.isStringLiteral() && !propType.isNumberLiteral() && !propType.isBooleanLiteral()) {
          isDiscriminant = false;
          break;
        }
      }

      if (isDiscriminant) {
        discriminantProp = propName;
        break;
      }
    }

    const variants: UnionVariant[] = [];

    for (const t of objectTypes) {
      const discriminantValue = discriminantProp
        ? t.getProperty(discriminantProp)?.getTypeAtLocation(sourceFile).getLiteralValue()
        : undefined;

      const variantName = discriminantValue
        ? this.toVariantName(String(discriminantValue))
        : `Variant${variants.length}`;

      const fields: StructField[] = [];
      for (const prop of t.getProperties()) {
        // Skip the discriminant property only if it's a string literal (will be handled by serde tagging)
        const propName = prop.getName();
        const propType = discriminantProp === propName ? t.getProperty(propName)?.getTypeAtLocation(sourceFile) : undefined;
        const isStringDiscriminant = discriminantProp === propName && propType?.isStringLiteral();
        
        if (isStringDiscriminant) continue;

        const propDecl = prop.getDeclarations()[0];
        let isOptional = false;
        if (propDecl && Node.isPropertySignature(propDecl)) {
          isOptional = propDecl.hasQuestionToken();
        }

        let resolvedType = this.resolveType(
          prop.getTypeAtLocation(sourceFile),
          sourceFile,
        );

        if (isOptional && resolvedType.kind !== "option") {
          resolvedType = { kind: "option", innerType: resolvedType };
        }

        fields.push({
          name: propName,
          type: resolvedType,
          optional: isOptional,
        });
      }

      if (fields.length > 0) {
        variants.push({
          name: variantName,
          type: {
            kind: "struct",
            name: variantName,
            fields,
          },
          discriminatorValue: discriminantValue ? String(discriminantValue) : undefined,
        });
      } else {
        variants.push({
          name: variantName,
          type: null,
          discriminatorValue: discriminantValue ? String(discriminantValue) : undefined,
        });
      }
    }

    return {
      kind: "union",
      name,
      variants,
      documentation: this.getDocumentation(declaration),
      discriminator: discriminantProp,
    };
  }

  private resolveLiteralUnionAsEnum(
    name: string,
    types: Type[],
    declaration: TypeAliasDeclaration,
  ): EnumType {
    const variants: EnumVariant[] = [];
    let isStringEnum = false;

    for (const t of types) {
      if (t.isNull() || t.isUndefined()) continue;

      const value = t.getLiteralValue();
      if (typeof value === "string") {
        isStringEnum = true;
        variants.push({
          name: this.toVariantName(value),
          value,
        });
      } else if (typeof value === "number") {
        variants.push({
          name: `Value${value}`,
          value,
        });
      }
    }

    return {
      kind: "enum",
      name,
      variants,
      isStringEnum,
      documentation: this.getDocumentation(declaration),
    };
  }

  private resolveUnionType(
    name: string,
    types: Type[],
    declaration: TypeAliasDeclaration,
  ): UnionType | null {
    const sourceFile = declaration.getSourceFile();
    const variants: UnionVariant[] = [];
    let hasUnresolvableType = false;

    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      if (!t || t.isNull() || t.isUndefined()) continue;

      const symbol = t.getSymbol() || t.getAliasSymbol();
      const variantName = symbol ? symbol.getName() : `Variant${i}`;

      const resolvedType = this.resolveType(t, sourceFile);

      if (resolvedType.kind === "json_value") {
        hasUnresolvableType = true;
      }

      variants.push({
        name: variantName,
        type: resolvedType.kind === "primitive" && resolvedType.type === "null" ? null : resolvedType,
      });
    }

    if (hasUnresolvableType) {
      return null;
    }

    return {
      kind: "union",
      name,
      variants,
      documentation: this.getDocumentation(declaration),
    };
  }

  /**
   * Convert a string literal to a valid Rust enum variant name
   */
  private toVariantName(value: string): string {
    return value
      .split(/[-_\s]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("");
  }

  private getDocumentation(node: Node): string | undefined {
    const jsDocs = (node as any).getJsDocs?.();
    if (jsDocs && jsDocs.length > 0) {
      return jsDocs.map((doc: any) => doc.getDescription()).join("\n");
    }
    return undefined;
  }
}
