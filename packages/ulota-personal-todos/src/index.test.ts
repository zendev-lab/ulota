import { expect, it } from "vitest";
import { personalTodoSchema } from "@zendev-lab/spark-protocol";
import { validateTodoRelations } from "./index.ts";
it("accepts an acyclic diamond but rejects missing references and indirect cycles", () => {
  const task = (id: string, dependencies: string[] = []) =>
    personalTodoSchema.parse({
      id,
      title: id,
      revision: 1,
      dependencies,
      completed_at: null,
      created_at: "now",
      updated_at: "now",
    });
  expect(() =>
    validateTodoRelations([task("a"), task("b", ["a"]), task("c", ["a"]), task("d", ["b", "c"])]),
  ).not.toThrow();
  expect(() =>
    validateTodoRelations([task("a", ["b"]), task("b", ["c"]), task("c", ["a"])]),
  ).toThrow(/cycle/);
  expect(() => validateTodoRelations([task("a", ["missing"])])).toThrow(/does not exist/);
});
