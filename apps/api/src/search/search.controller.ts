import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.service.search(user.companyId, q ?? "");
  }
}
