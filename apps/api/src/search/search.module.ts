import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { Embedder } from "./semantic/embedder";
import { EmbedProcessor } from "./semantic/embed.processor";
import { SemanticIndexProcessor } from "./semantic/semantic-index.processor";
import { SemanticSearchService } from "./semantic/semantic-search.service";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  controllers: [SearchController],
  providers: [SearchService, SemanticSearchService, Embedder, ...backgroundProviders(SemanticIndexProcessor), ...backgroundProviders(EmbedProcessor)],
})
export class SearchModule {}
