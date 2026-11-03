import {
  personalTodoSchema,
  personalTodoRequestSchema,
  personalTodoFiltersSchema,
  type PersonalTodo,
} from "@zendev-lab/spark-protocol";
export interface PersonalTodoRepository {
  list(): PersonalTodo[];
  get(id: string): PersonalTodo | undefined;
  insert(item: PersonalTodo): void;
  replace(item: PersonalTodo, expectedRevision: number): void;
  remove(id: string, expectedRevision: number): void;
}
function relationError(message: string): never {
  throw Object.assign(new Error(message), { code: "invalid_relation" });
}
export function validateTodoRelations(items: readonly PersonalTodo[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const kind of ["parent", "dependency"] as const) {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) relationError(`Todo ${kind} cycle is not allowed.`);
      if (visited.has(id)) return;
      const item = byId.get(id);
      if (!item) relationError("Related todo does not exist for this owner.");
      visiting.add(id);
      const links =
        kind === "parent" ? (item.parent_id ? [item.parent_id] : []) : item.dependencies;
      if (new Set(links).size !== links.length)
        relationError("Duplicate dependencies are not allowed.");
      for (const target of links) visit(target);
      visiting.delete(id);
      visited.add(id);
    };
    for (const item of items) visit(item.id);
  }
}
export function personalTodoSnapshot(
  repository: PersonalTodoRepository,
  input: unknown = {},
  today = new Date().toISOString().slice(0, 10),
) {
  const filters = personalTodoFiltersSchema.parse(input);
  const query = filters.search.trim().toLocaleLowerCase();
  const items = repository
    .list()
    .filter(
      (item) =>
        (!query || `${item.title} ${item.description}`.toLocaleLowerCase().includes(query)) &&
        (!filters.status || item.status === filters.status) &&
        (!filters.priority || item.priority === filters.priority) &&
        (filters.parent_id === undefined || item.parent_id === filters.parent_id),
    );
  const statusCount: Record<string, number> = {};
  const priorityCount: Record<string, number> = {};
  for (const item of items) {
    statusCount[item.status] = (statusCount[item.status] ?? 0) + 1;
    priorityCount[item.priority] = (priorityCount[item.priority] ?? 0) + 1;
  }
  return {
    items,
    filters,
    stats: {
      total: items.length,
      total_tasks: items.length,
      statusCount,
      priorityCount,
      completed_tasks: statusCount.Completed ?? 0,
      in_progress_tasks: statusCount.InProgress ?? 0,
      overdue_tasks: items.filter(
        (item) =>
          item.due_date &&
          item.due_date < today &&
          !["Completed", "Cancelled"].includes(item.status),
      ).length,
      total_estimated_hours: items.reduce((sum, item) => sum + item.estimated_hours, 0),
      completed_hours: items
        .filter((item) => item.status === "Completed")
        .reduce((sum, item) => sum + item.estimated_hours, 0),
    },
  };
}
export function executePersonalTodo(
  repository: PersonalTodoRepository,
  raw: unknown,
  now = new Date(),
) {
  const request = personalTodoRequestSchema.parse(raw);
  if (request.action === "list" || request.action === "stats") {
    const snapshot = personalTodoSnapshot(
      repository,
      request.input,
      now.toISOString().slice(0, 10),
    );
    return request.action === "stats"
      ? { stats: snapshot.stats, filters: snapshot.filters }
      : snapshot;
  }
  if (request.action === "create") {
    const item = personalTodoSchema.parse({
      ...request.input,
      id: crypto.randomUUID(),
      revision: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      completed_at: request.input.status === "Completed" ? now.toISOString() : null,
    });
    validateTodoRelations([...repository.list(), item]);
    repository.insert(item);
    return item;
  }
  const current = repository.get(request.input.id);
  if (!current) throw Object.assign(new Error("Personal todo not found."), { code: "not_found" });
  if (request.action === "get") return current;
  if (request.action === "delete") {
    if (
      repository
        .list()
        .some((item) => item.parent_id === current.id || item.dependencies.includes(current.id))
    )
      relationError("Remove child and dependency references before deleting this todo.");
    repository.remove(current.id, request.input.expectedRevision);
    return { deleted: true };
  }
  const patch = Object.fromEntries(
    Object.entries(request.input.patch).filter(([, value]) => value !== undefined),
  );
  const item = personalTodoSchema.parse({
    ...current,
    ...patch,
    revision: current.revision + 1,
    updated_at: now.toISOString(),
  });
  item.completed_at =
    item.status === "Completed" ? (current.completed_at ?? now.toISOString()) : null;
  validateTodoRelations(
    repository.list().map((existing) => (existing.id === item.id ? item : existing)),
  );
  repository.replace(item, request.input.expectedRevision);
  return item;
}
