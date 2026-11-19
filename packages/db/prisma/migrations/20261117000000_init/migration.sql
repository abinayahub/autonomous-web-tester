-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TESTER', 'VIEWER');

-- CreateEnum
CREATE TYPE "EnvironmentType" AS ENUM ('PRODUCTION', 'STAGING', 'TEST', 'LOCAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceClass" AS ENUM ('DESKTOP', 'TABLET', 'MOBILE');

-- CreateEnum
CREATE TYPE "TestModule" AS ENUM ('UI_LAYOUT', 'RESPONSIVE', 'IMAGE', 'BUTTON', 'NAVIGATION', 'FORM', 'PASSWORD', 'FUNCTIONAL', 'ACCESSIBILITY', 'CONSOLE_NETWORK');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('PASSED', 'FAILED', 'FLAKY', 'SKIPPED', 'ERROR', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingClassification" AS ENUM ('CONFIRMED', 'FLAKY', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'FIXED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "ElementRisk" AS ENUM ('SAFE', 'MUTATING', 'DESTRUCTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('PAGE_SCREENSHOT', 'ELEMENT_SCREENSHOT', 'DOM_SNAPSHOT', 'HAR', 'CONSOLE_LOG', 'NETWORK_LOG', 'TRACE', 'VIDEO');

-- CreateEnum
CREATE TYPE "DiscoverySource" AS ENUM ('SEED', 'SITEMAP', 'LINK', 'NAV_MENU', 'DROPDOWN', 'SPA_ROUTE', 'BUTTON_NAVIGATION', 'REDIRECT');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX');

-- CreateEnum
CREATE TYPE "EventLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'TESTER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "allowed_domains" TEXT[],
    "excluded_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environment" "EnvironmentType" NOT NULL DEFAULT 'STAGING',
    "max_pages" INTEGER NOT NULL DEFAULT 200,
    "max_depth" INTEGER NOT NULL DEFAULT 6,
    "rate_limit_rps" INTEGER NOT NULL DEFAULT 4,
    "viewports" JSONB,
    "browsers" TEXT[] DEFAULT ARRAY['chromium']::TEXT[],
    "authorization_confirmed_at" TIMESTAMP(3),
    "authorization_confirmed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "username_enc" BYTEA NOT NULL,
    "username_iv" BYTEA NOT NULL,
    "username_tag" BYTEA NOT NULL,
    "password_enc" BYTEA NOT NULL,
    "password_iv" BYTEA NOT NULL,
    "password_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "login_url" TEXT,
    "login_config" JSONB,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "base_url" TEXT,
    "text_model" TEXT,
    "vision_model" TEXT,
    "fast_model" TEXT,
    "api_key_enc" BYTEA,
    "api_key_iv" BYTEA,
    "api_key_tag" BYTEA,
    "key_version" INTEGER,
    "max_tokens_per_run" INTEGER NOT NULL DEFAULT 500000,
    "vision_review_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "started_by" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "config_snapshot" JSONB NOT NULL,
    "pages_discovered" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_failed" INTEGER NOT NULL DEFAULT 0,
    "tests_flaky" INTEGER NOT NULL DEFAULT 0,
    "confirmed_issues" INTEGER NOT NULL DEFAULT 0,
    "review_items" INTEGER NOT NULL DEFAULT 0,
    "ai_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "title" TEXT,
    "page_name" TEXT,
    "status_code" INTEGER,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "discovered_from_id" UUID,
    "discovery_source" "DiscoverySource" NOT NULL DEFAULT 'LINK',
    "requires_auth" BOOLEAN NOT NULL DEFAULT false,
    "is_spa_route" BOOLEAN NOT NULL DEFAULT false,
    "load_time_ms" INTEGER,
    "dom_hash" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_access" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "credential_id" UUID,
    "accessible" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "redirected_to" TEXT,

    CONSTRAINT "page_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "element_type" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "role" TEXT,
    "accessible_name" TEXT,
    "text" TEXT,
    "attributes" JSONB,
    "bounding_box" JSONB,
    "risk" "ElementRisk" NOT NULL DEFAULT 'UNKNOWN',
    "risk_reason" TEXT,

    CONSTRAINT "elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "page_id" UUID,
    "element_id" UUID,
    "module" "TestModule" NOT NULL,
    "name" TEXT NOT NULL,
    "viewport_id" TEXT,
    "device_class" "DeviceClass",
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "credential_role" TEXT,
    "input_data" JSONB,
    "status" "TestStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "observations" JSONB,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "issue_key" TEXT NOT NULL,
    "issue_number" SERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "page_id" UUID,
    "test_case_id" UUID,
    "element_id" UUID,
    "classification" "FindingClassification" NOT NULL,
    "module" "TestModule" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "expected_result" TEXT NOT NULL,
    "actual_result" TEXT NOT NULL,
    "steps_to_reproduce" JSONB NOT NULL,
    "page_name" TEXT,
    "page_url" TEXT NOT NULL,
    "viewport_id" TEXT,
    "device_class" "DeviceClass",
    "browser" TEXT,
    "fingerprint" TEXT NOT NULL,
    "ai_model" TEXT,
    "ai_confidence" DOUBLE PRECISION,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "page_id" UUID,
    "test_case_id" UUID,
    "issue_id" UUID,
    "type" "ArtifactType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "page_id" UUID,
    "element_id" UUID,
    "action_description" TEXT NOT NULL,
    "risk_reason" TEXT NOT NULL,
    "risk" "ElementRisk" NOT NULL,
    "payload_preview" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "generated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "level" "EventLevel" NOT NULL DEFAULT 'INFO',
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_project_id_role_name_key" ON "credentials"("project_id", "role_name");

-- CreateIndex
CREATE UNIQUE INDEX "ai_settings_project_id_key" ON "ai_settings"("project_id");

-- CreateIndex
CREATE INDEX "test_runs_project_id_queued_at_idx" ON "test_runs"("project_id", "queued_at" DESC);

-- CreateIndex
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");

-- CreateIndex
CREATE INDEX "pages_run_id_idx" ON "pages"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_run_id_normalized_url_key" ON "pages"("run_id", "normalized_url");

-- CreateIndex
CREATE UNIQUE INDEX "page_access_page_id_credential_id_key" ON "page_access"("page_id", "credential_id");

-- CreateIndex
CREATE INDEX "elements_page_id_idx" ON "elements"("page_id");

-- CreateIndex
CREATE INDEX "test_cases_run_id_module_status_idx" ON "test_cases"("run_id", "module", "status");

-- CreateIndex
CREATE UNIQUE INDEX "issues_issue_key_key" ON "issues"("issue_key");

-- CreateIndex
CREATE UNIQUE INDEX "issues_issue_number_key" ON "issues"("issue_number");

-- CreateIndex
CREATE INDEX "issues_run_id_classification_severity_idx" ON "issues"("run_id", "classification", "severity");

-- CreateIndex
CREATE INDEX "issues_project_id_fingerprint_idx" ON "issues"("project_id", "fingerprint");

-- CreateIndex
CREATE INDEX "artifacts_run_id_idx" ON "artifacts"("run_id");

-- CreateIndex
CREATE INDEX "artifacts_issue_id_idx" ON "artifacts"("issue_id");

-- CreateIndex
CREATE INDEX "approvals_run_id_status_idx" ON "approvals"("run_id", "status");

-- CreateIndex
CREATE INDEX "run_events_run_id_id_idx" ON "run_events"("run_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_discovered_from_id_fkey" FOREIGN KEY ("discovered_from_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_access" ADD CONSTRAINT "page_access_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_access" ADD CONSTRAINT "page_access_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elements" ADD CONSTRAINT "elements_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_element_id_fkey" FOREIGN KEY ("element_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_element_id_fkey" FOREIGN KEY ("element_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_element_id_fkey" FOREIGN KEY ("element_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

