import type { Prisma } from "@prisma/client";

export const PROJECT_RESOURCE_KEY = "projectResource";

export type ProjectResourceMeta = { model: Prisma.ModelName; param: string } | { exempt: string };

/**
 * The route param `param` is the id of a `model` row, and that row belongs to a project (its own
 * `projectId`, or its parent's — see projectPathFor). ProjectAccessGuard looks the row up and
 * applies Project.restrictedToMembers before the handler runs, the same way it does for a route
 * that carries `projectId` itself. On a controller it covers every route that has that param. A
 * handler's own declarations add to the controller's rather than replacing them, so
 * `estimates/:estimateId/change-orders/:id` can check both the estimate and the change order.
 */
export const ProjectResource = (model: Prisma.ModelName, param = "id"): MethodDecorator & ClassDecorator => appendMeta({ model, param });

/**
 * The route's params don't point into a project (a worker, a client, a catalog item, a company
 * setting), or its handler checks project access itself for a reason spelled out in `reason`.
 * project-resource-routes.spec.ts requires every id-keyed route to say one or the other.
 */
export const NotProjectScoped = (reason: string): MethodDecorator & ClassDecorator => appendMeta({ exempt: reason });

/** Declarations on a handler or controller, in the order written. */
export function projectResourcesOf(target: object): ProjectResourceMeta[] {
  return (Reflect.getMetadata(PROJECT_RESOURCE_KEY, target) as ProjectResourceMeta[] | undefined) ?? [];
}

function appendMeta(meta: ProjectResourceMeta): MethodDecorator & ClassDecorator {
  return (target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const on = descriptor ? (descriptor.value as object) : target;
    Reflect.defineMetadata(PROJECT_RESOURCE_KEY, [...projectResourcesOf(on), meta], on);
  };
}
