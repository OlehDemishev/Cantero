import { Prisma } from "@prisma/client";

/**
 * How to get from a row of `model` to the project it belongs to: [] when the model has its own
 * `projectId`, otherwise the to-one relations to follow (["estimate"] for an EstimateLine,
 * ["section", "estimate"] for a model two levels down). Worked out once from the Prisma schema, so a
 * new model needs no hand-written lookup. Shortest path wins, required relations before optional
 * ones; null when the model can't reach a project at all.
 */
export function projectPathFor(model: string): string[] | null {
  if (!paths.has(model)) paths.set(model, search(model));
  return paths.get(model)!;
}

const paths = new Map<string, string[] | null>();
const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

function search(start: string): string[] | null {
  if (!models.has(start) || start === "Project") return null;
  // Breadth-first over to-one relations this model holds the foreign key for, required ones first.
  const queue: { model: string; path: string[] }[] = [{ model: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const { model, path } = queue.shift()!;
    const fields = models.get(model)!.fields;
    if (fields.some((f) => f.kind === "scalar" && f.name === "projectId")) return path;
    const relations = fields
      .filter((f) => f.kind === "object" && !f.isList && (f.relationFromFields?.length ?? 0) > 0 && f.type !== "Project")
      .sort((a, b) => Number(b.isRequired) - Number(a.isRequired));
    for (const f of relations) {
      if (seen.has(f.type)) continue;
      seen.add(f.type);
      queue.push({ model: f.type, path: [...path, f.name] });
    }
  }
  return null;
}

/** `select` for findUnique that reads `projectId` at the end of `path`. */
export function projectSelect(path: string[]): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>((inner, relation) => ({ [relation]: { select: inner } }), { projectId: true });
}

/** The projectId in a row read with projectSelect(path); null when a link on the way is empty. */
export function readProjectId(row: unknown, path: string[]): string | null {
  let at: unknown = row;
  for (const relation of path) at = (at as Record<string, unknown> | null)?.[relation];
  const projectId = (at as { projectId?: unknown } | null)?.projectId;
  return typeof projectId === "string" ? projectId : null;
}

/**
 * `where` for `model` keeping rows whose project isn't one of `hidden` — including rows with no
 * project at all (a null projectId, or an empty optional link on the way to it; plain `NOT IN`
 * would drop those, since SQL never matches NULL against a list).
 */
export function excludeProjectsWhere(model: string, hidden: string[]): Record<string, unknown> {
  if (model === "Project") return { id: { notIn: hidden } };
  const path = projectPathFor(model);
  if (!path) throw new Error(`${model} has no path to a project`);
  const build = (at: string, rest: string[]): Record<string, unknown> => {
    const fields = models.get(at)!.fields;
    if (rest.length === 0) {
      const projectId = fields.find((f) => f.name === "projectId")!;
      const notHidden = { projectId: { notIn: hidden } };
      return projectId.isRequired ? notHidden : { OR: [{ projectId: null }, notHidden] };
    }
    const relation = fields.find((f) => f.name === rest[0])!;
    const inner = { [relation.name]: { is: build(relation.type, rest.slice(1)) } };
    return relation.isRequired ? inner : { OR: [{ [relation.name]: { is: null } }, inner] };
  };
  return build(model, path);
}
