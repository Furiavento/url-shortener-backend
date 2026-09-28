CREATE TABLE "urls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "urls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" varchar(16) NOT NULL,
	"original_url" text NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "urls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "urls_created_at_idx" ON "urls" USING btree ("created_at");