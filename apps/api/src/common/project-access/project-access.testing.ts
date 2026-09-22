import { ProjectAccessService } from "./project-access.service";

/**
 * A ProjectAccessService for unit tests that hides nothing and lets every check pass — for specs
 * about something else that only need the dependency present. Tests of the restriction itself mock
 * the method they care about instead.
 */
export function projectAccessThatSeesAll() {
  return {
    provide: ProjectAccessService,
    useValue: {
      assertAccess: jest.fn().mockResolvedValue(undefined),
      filterAccessible: jest.fn(async <T>(projects: T[]) => projects),
      hiddenProjectIds: jest.fn().mockResolvedValue([]),
      visibleWhere: jest.fn().mockResolvedValue({}),
      projectIdOf: jest.fn().mockResolvedValue(null),
    },
  };
}
