import { BadRequestException, Controller, Get, ParseUUIDPipe, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SearchService } from "./search.service";
import { SemanticSearchService } from "./semantic/semantic-search.service";
import type { SemanticType } from "./semantic/sources";

@Controller("search")
export class SearchController {
  constructor(
    private readonly service: SearchService,
    private readonly semantic: SemanticSearchService,
  ) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.service.search(user.companyId, q ?? "", user.userId, user.role);
  }

  /** Search by meaning (any of the app's languages). projectId narrows it; it rides in the query
   * string so the project access guard checks it. */
  @Get("semantic")
  semanticSearch(@CurrentUser() user: AuthUser, @Query("q") q?: string, @Query("projectId") projectId?: string) {
    return this.semantic.search(user, q ?? "", { projectId: projectId || undefined });
  }

  /** "A similar RFI / punch item already exists" while filing a new one. */
  @Get("similar")
  similar(
    @CurrentUser() user: AuthUser,
    @Query("type") type: string,
    @Query("projectId", ParseUUIDPipe) projectId: string,
    @Query("text") text: string,
    @Query("excludeId") excludeId?: string,
  ) {
    if (!projectId || !type) throw new BadRequestException("type and projectId are required");
    return this.semantic.similar(user, { type: type as SemanticType, projectId, text: text ?? "", excludeId });
  }
}
