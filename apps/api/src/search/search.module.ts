import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { Embedder } from "./semantic/embedder";
import { SemanticIndexProcessor } from "./semantic/semantic-index.processor";
import { SemanticSearchService } from "./semantic/semantic-search.service";

@Module({
  controllers: [SearchController],
  providers: [SearchService, SemanticSearchService, Embedder, SemanticIndexProcessor],
})
export class SearchModule {}
