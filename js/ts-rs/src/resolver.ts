/// <reference types="bun" />
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
  Symbol as TsSymbol,
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
    // Try to find tsconfig.json in parent directories
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
      // Resolve specific types
      for (const typeName of this.options.typeNames) {
        this.resolveTypeByName(sourceFile, typeName);
      }
    } else {
      // Resolve all exported types
      this.resolveAllExportedTypes(sourceFile);
    }

    return Array.from(this.collectedTypes.values());
  }

  private resolveAllExportedTypes(sourceFile: SourceFile): void {
    // Get all exported declarations
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
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
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

    // Track type parameters for this scope
    const previousTypeParams = new Set(this.typeParameters);
    typeParams.forEach((tp) => this.typeParameters.add(tp));

    try {
      // Handle extended interfaces
      for (const extendedType of declaration.getExtends()) {
        const baseType = extendedType.getType();
        const baseFields = this.extractFieldsFromType(baseType, declaration.getSourceFile());
        fields.push(...baseFields);
      }

      // Get own properties
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
      // Restore previous type parameters
      this.typeParameters = previousTypeParams;
    }
  }

  private extractFieldsFromType(type: Type, sourceFile: SourceFile): StructField[] {
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
    const typeNode = prop.getTypeNode();
    const type = prop.getType();

    let resolvedType = this.resolveType(type, prop.getSourceFile());

    // Wrap in Option if optional and not already an Option
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
    const typeNode = declaration.getTypeNode();

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

    // Check if it's a union type
    if (type.isUnion()) {
      const unionTypes = type.getUnionTypes();
      
      // Check for discriminated union or tagged union
      if (this.isDiscriminatedUnion(unionTypes, declaration.getSourceFile())) {
        const unionType = this.resolveDiscriminatedUnion(name, unionTypes, declaration);
        this.collectedTypes.set(name, {
          name,
          type: unionType,
          sourceFile: declaration.getSourceFile().getFilePath(),
        });
        return;
      }

      // Check for simple literal union (string literals, number literals)
      if (this.isLiteralUnion(unionTypes)) {
        const enumType = this.resolveLiteralUnionAsEnum(name, unionTypes, declaration);
        this.collectedTypes.set(name, {
          name,
          type: enumType,
          sourceFile: declaration.getSourceFile().getFilePath(),
        });
        return;
      }

      // For other union types, try to create a Rust enum
      const unionType = this.resolveUnionType(name, unionTypes, declaration);
      this.collectedTypes.set(name, {
        name,
        type: unionType,
        sourceFile: declaration.getSourceFile().getFilePath(),
      });
      return;
    }

    // If it's just a type alias to another named type, we might skip it or create an alias
    // For simplicity, we'll resolve the underlying type
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
              // Try to resolve this type by name
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
    // Handle type references
    if (typeNode.getKind() === SyntaxKind.TypeReference) {
      const typeRef = typeNode.asKind(SyntaxKind.TypeReference);
      if (typeRef) {
        const typeName = typeRef.getTypeName().getText();
        
        // Check for built-in types
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
        
        // Try to resolve the type from imports
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
            // Add the file to the project if not already there
            this.project.addSourceFileAtPath(moduleSourceFile.getFilePath());
            
            // Try to find the type in the imported file
            const declaration = this.findTypeDeclaration(moduleSourceFile, typeName);
            if (declaration) {
              this.resolveTypeByName(moduleSourceFile, typeName);
              return { kind: "struct", name: typeName, fields: [] };
            }
          }
        }
      }
    }
    
    // Could not resolve, return json_value
    return { kind: "json_value" };
  }

  private resolveType(type: Type, sourceFile: SourceFile): ResolvedType {
    // Handle null and undefined
    if (type.isNull()) {
      return { kind: "primitive", type: "null" };
    }

    if (type.isUndefined()) {
      return { kind: "primitive", type: "undefined" };
    }

    // Handle type parameters (generics like T, U, etc.)
    if (type.isTypeParameter()) {
      const typeParamName = type.getSymbol()?.getName();
      if (typeParamName && this.typeParameters.has(typeParamName)) {
        // This is a known type parameter, return json_value as a generic placeholder
        return { kind: "json_value" };
      }
    }

    // Handle primitive types
    if (type.isString() || type.isStringLiteral()) {
      return { kind: "primitive", type: "string" };
    }

    if (type.isNumber() || type.isNumberLiteral()) {
      return { kind: "primitive", type: "number" };
    }

    if (type.isBoolean() || type.isBooleanLiteral()) {
      return { kind: "primitive", type: "boolean" };
    }

    // Handle any and unknown
    if (type.isAny() || type.isUnknown()) {
      return { kind: "json_value" };
    }

    // Handle literal types
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

    // Handle arrays
    if (type.isArray()) {
      const elementType = type.getArrayElementType();
      if (elementType) {
        return {
          kind: "array",
          elementType: this.resolveType(elementType, sourceFile),
        };
      }
    }

    // Handle tuples
    if (type.isTuple()) {
      const tupleTypes = type.getTupleElements();
      return {
        kind: "tuple",
        elements: tupleTypes.map((t) => this.resolveType(t, sourceFile)),
      };
    }

    // Handle union types (including T | null, T | undefined)
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

    // Handle type references (named types)
    const symbol = type.getSymbol() || type.getAliasSymbol();
    if (symbol) {
      const symbolName = symbol.getName();

      // Handle built-in types
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

      // Skip internal TypeScript types
      if (this.isInternalType(symbolName)) {
        return { kind: "json_value" };
      }

      // Handle custom types - resolve them
      if (!this.isBuiltInType(type)) {
        // Try to resolve and collect this type
        const decl = symbol.getDeclarations()?.[0];
        if (decl) {
          const declSourceFile = decl.getSourceFile();
          // Only resolve types from user files, not node_modules
          if (!declSourceFile.getFilePath().includes("node_modules")) {
            this.project.addSourceFileAtPath(declSourceFile.getFilePath());
            this.resolveTypeByName(declSourceFile, symbolName);
          } else {
            // For node_modules types, return json_value
            return { kind: "json_value" };
          }
        }

        // Return a reference to the struct
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
    return { kind: "json_value" };
  }

  private resolveInlineUnionType(type: Type, sourceFile: SourceFile): ResolvedType {
    const unionTypes = type.getUnionTypes();

    // Check for T | null or T | undefined patterns (should become Option<T>)
    const nullOrUndefinedTypes = unionTypes.filter(
      (t) => t.isNull() || t.isUndefined(),
    );
    const nonNullTypes = unionTypes.filter(
      (t) => !t.isNull() && !t.isUndefined(),
    );

    if (nullOrUndefinedTypes.length > 0 && nonNullTypes.length === 1 && nonNullTypes[0]) {
      return {
        kind: "option",
        innerType: this.resolveType(nonNullTypes[0], sourceFile),
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

    // Check for literal union (string enum-like)
    if (this.isLiteralUnion(unionTypes)) {
      // All string literals - this could be an inline enum
      // Return as json_value since we can't create an anonymous enum inline
      // The caller should handle this case appropriately
      return { kind: "json_value" };
    }

    // For other unions, fallback to json_value
    return { kind: "json_value" };
  }

  private isBuiltInType(type: Type): boolean {
    // Check alias symbol first (for type aliases)
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

    // Filter out null/undefined
    const objectTypes = types.filter(
      (t) => t.isObject() && !t.isNull() && !t.isUndefined(),
    );
    if (objectTypes.length < 2) return false;

    const firstObjectType = objectTypes[0];
    if (!firstObjectType) return false;

    // Find common property names
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

      // Create a struct for this variant
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
  ): UnionType {
    const sourceFile = declaration.getSourceFile();
    const variants: UnionVariant[] = [];

    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      if (!t || t.isNull() || t.isUndefined()) continue;

      const symbol = t.getSymbol() || t.getAliasSymbol();
      const variantName = symbol ? symbol.getName() : `Variant${i}`;

      const resolvedType = this.resolveType(t, sourceFile);

      variants.push({
        name: variantName,
        type: resolvedType.kind === "primitive" && resolvedType.type === "null" ? null : resolvedType,
      });
    }

    return {
      kind: "union",
      name,
      variants,
      documentation: this.getDocumentation(declaration),
    };
  }

  private toVariantName(value: string): string {
    // Convert a string literal to a valid Rust enum variant name
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
