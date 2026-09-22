-- Meaning-based search: a second vector for the title/subject alone (see SearchEmbedding).
-- AlterTable
ALTER TABLE "search_embeddings" ADD COLUMN     "titleEmbedding" REAL[] DEFAULT ARRAY[]::REAL[];
