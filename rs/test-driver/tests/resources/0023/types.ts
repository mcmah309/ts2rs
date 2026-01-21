// Test maps and sets. Note for the test data we do not include multiple entries since the order
// will be lost on validation for our current test harness

export type TestType2 = {
    field1: number,
    field2?: string,
}

export type TestType1 = {
    set: Set<string>,
    map: Map<string, TestType2>
};