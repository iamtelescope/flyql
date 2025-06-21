import { parse } from "./src/index.js";

function testQuery(query, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`Query: "${query}"`);

  try {
    const result = parse(query);
    console.log("✅ Success!");
    console.log("AST Root:", JSON.stringify(result.root, null, 2));
  } catch (error) {
    console.log("❌ Error:", error.message);
    console.log("Error code:", error.errno);
  }
}

console.log("🚀 FlyQL JavaScript Parser Test\n");

testQuery("key=value", "Simple equality");
testQuery("status=200", "Numeric value");
testQuery('name="john doe"', "Quoted string");
testQuery("count>10", "Greater than");
testQuery("message=~hello.*", "Regex match");

testQuery("key = value", "Spaces around equals");
testQuery("key =value", "Space before equals");
testQuery("key= value", "Space after equals");
testQuery("key   =   value", "Multiple spaces");

testQuery("a=1 and b=2", "AND operator");
testQuery("status=200 or status=404", "OR operator");

testQuery("(a=1 and b=2)", "Simple grouping");
testQuery("status=200 and (service=api or service=web)", "Complex grouping");

testQuery("user:name=john", "Nested key");

testQuery("text='john\\'s book'", "Escaped single quotes");
testQuery('text="say \\"hello\\""', "Escaped double quotes");

testQuery(
  'level=ERROR and (service=payment or service=auth) and message=~".*timeout.*"',
  "Complex real-world query",
);

testQuery("", "Empty query");
testQuery("key=", "Missing value");
testQuery("invalid==query", "Invalid operator");

console.log("\n🏁 Test completed!");
