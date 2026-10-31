import { patientKeys } from "../features/patients/hooks/use-patients";

function testQueryKeyFactory() {
  console.log("=== TESTING PATIENT QUERY KEY FACTORY ===");

  const all = patientKeys.all;
  console.log("patientKeys.all:", all);
  if (JSON.stringify(all) !== JSON.stringify(["patients"])) {
    throw new Error("patientKeys.all failed");
  }

  const lists = patientKeys.lists();
  console.log("patientKeys.lists():", lists);
  if (JSON.stringify(lists) !== JSON.stringify(["patients", "list"])) {
    throw new Error("patientKeys.lists() failed");
  }

  const p1 = patientKeys.list({ page: 1, limit: 10 });
  const p2 = patientKeys.list({ page: 2, limit: 10 });
  const p1Search = patientKeys.list({ page: 1, limit: 10, search: "John" });

  console.log("patientKeys.list(p1):", p1);
  console.log("patientKeys.list(p2):", p2);
  console.log("patientKeys.list(p1Search):", p1Search);

  if (JSON.stringify(p1) === JSON.stringify(p2)) {
    throw new Error("p1 and p2 should have distinct cache keys");
  }
  if (JSON.stringify(p1) === JSON.stringify(p1Search)) {
    throw new Error("p1 and p1Search should have distinct cache keys");
  }

  const detail = patientKeys.detail("PDC-000001");
  console.log("patientKeys.detail('PDC-000001'):", detail);
  if (JSON.stringify(detail) !== JSON.stringify(["patients", "detail", "PDC-000001"])) {
    throw new Error("patientKeys.detail failed");
  }

  console.log("\n✓ ALL QUERY KEY FACTORY TESTS PASSED (100% GREEN)!");
}

testQueryKeyFactory();
