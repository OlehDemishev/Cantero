-- An index behind every foreign key that had none (AUDIT-2026-09-25 P3-3): without one, deleting
-- or re-keying the referenced row scans the whole referencing table, and so do JOINs from that
-- side. Plain CREATE INDEX (not CONCURRENTLY — Prisma runs each migration in a transaction): fine
-- on a new or small database; on a large live one, create these by hand with CONCURRENTLY first.
-- CreateIndex
CREATE INDEX "annotations_companyId_idx" ON "annotations"("companyId");

-- CreateIndex
CREATE INDEX "assembly_items_rateCatalogItemId_idx" ON "assembly_items"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "bank_transactions_matchedExpenseId_idx" ON "bank_transactions"("matchedExpenseId");

-- CreateIndex
CREATE INDEX "bank_transactions_matchedInvoiceId_idx" ON "bank_transactions"("matchedInvoiceId");

-- CreateIndex
CREATE INDEX "benefit_enrollments_tierId_idx" ON "benefit_enrollments"("tierId");

-- CreateIndex
CREATE INDEX "change_order_lines_rateCatalogItemId_idx" ON "change_order_lines"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "comments_authorUserId_idx" ON "comments"("authorUserId");

-- CreateIndex
CREATE INDEX "companies_parentCompanyId_idx" ON "companies"("parentCompanyId");

-- CreateIndex
CREATE INDEX "companies_referredByCompanyId_idx" ON "companies"("referredByCompanyId");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "contracts_subcontractorId_idx" ON "contracts"("subcontractorId");

-- CreateIndex
CREATE INDEX "cost_code_budget_transfers_fromCostCodeId_idx" ON "cost_code_budget_transfers"("fromCostCodeId");

-- CreateIndex
CREATE INDEX "cost_code_budget_transfers_toCostCodeId_idx" ON "cost_code_budget_transfers"("toCostCodeId");

-- CreateIndex
CREATE INDEX "custom_reports_userId_idx" ON "custom_reports"("userId");

-- CreateIndex
CREATE INDEX "daily_logs_authorUserId_idx" ON "daily_logs"("authorUserId");

-- CreateIndex
CREATE INDEX "deficiencies_assigneeWorkerId_idx" ON "deficiencies"("assigneeWorkerId");

-- CreateIndex
CREATE INDEX "documents_invoiceId_idx" ON "documents"("invoiceId");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- CreateIndex
CREATE INDEX "documents_uploadedByUserId_idx" ON "documents"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "drawing_sets_companyId_idx" ON "drawing_sets"("companyId");

-- CreateIndex
CREATE INDEX "drawing_sheets_drawingSetId_idx" ON "drawing_sheets"("drawingSetId");

-- CreateIndex
CREATE INDEX "equipment_assignments_workerId_idx" ON "equipment_assignments"("workerId");

-- CreateIndex
CREATE INDEX "equipment_fuel_logs_supplierId_idx" ON "equipment_fuel_logs"("supplierId");

-- CreateIndex
CREATE INDEX "equipment_maintenance_records_supplierId_idx" ON "equipment_maintenance_records"("supplierId");

-- CreateIndex
CREATE INDEX "estimate_lines_rateCatalogItemId_idx" ON "estimate_lines"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "estimate_lines_sectionId_idx" ON "estimate_lines"("sectionId");

-- CreateIndex
CREATE INDEX "estimate_material_requirements_materialCatalogItemId_idx" ON "estimate_material_requirements"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "incoming_e_invoices_supplierId_idx" ON "incoming_e_invoices"("supplierId");

-- CreateIndex
CREATE INDEX "inspection_checklists_inspectorWorkerId_idx" ON "inspection_checklists"("inspectorWorkerId");

-- CreateIndex
CREATE INDEX "inventory_cost_layers_materialCatalogItemId_idx" ON "inventory_cost_layers"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "invoices_clientId_companyId_idx" ON "invoices"("clientId", "companyId");

-- CreateIndex
CREATE INDEX "invoices_estimateId_idx" ON "invoices"("estimateId");

-- CreateIndex
CREATE INDEX "invoices_projectId_companyId_idx" ON "invoices"("projectId", "companyId");

-- CreateIndex
CREATE INDEX "jha_acknowledgments_workerId_idx" ON "jha_acknowledgments"("workerId");

-- CreateIndex
CREATE INDEX "lien_waivers_projectId_idx" ON "lien_waivers"("projectId");

-- CreateIndex
CREATE INDEX "loans_equipmentId_idx" ON "loans"("equipmentId");

-- CreateIndex
CREATE INDEX "long_lead_items_purchaseOrderId_idx" ON "long_lead_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "long_lead_items_supplierId_idx" ON "long_lead_items"("supplierId");

-- CreateIndex
CREATE INDEX "material_rfq_lines_materialCatalogItemId_idx" ON "material_rfq_lines"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "memberships_customRoleId_idx" ON "memberships"("customRoleId");

-- CreateIndex
CREATE INDEX "portal_messages_authorClientId_idx" ON "portal_messages"("authorClientId");

-- CreateIndex
CREATE INDEX "portal_messages_authorUserId_idx" ON "portal_messages"("authorUserId");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateIndex
CREATE INDEX "punch_list_items_assigneeWorkerId_idx" ON "punch_list_items"("assigneeWorkerId");

-- CreateIndex
CREATE INDEX "punch_list_items_drawingSheetId_idx" ON "punch_list_items"("drawingSheetId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_materialCatalogItemId_idx" ON "purchase_order_lines"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_companyId_idx" ON "purchase_orders"("supplierId", "companyId");

-- CreateIndex
CREATE INDEX "rate_catalog_item_materials_materialCatalogItemId_idx" ON "rate_catalog_item_materials"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "recurring_invoices_clientId_idx" ON "recurring_invoices"("clientId");

-- CreateIndex
CREATE INDEX "recurring_invoices_projectId_idx" ON "recurring_invoices"("projectId");

-- CreateIndex
CREATE INDEX "rfis_drawingSheetId_idx" ON "rfis"("drawingSheetId");

-- CreateIndex
CREATE INDEX "safety_briefing_attendance_workerId_idx" ON "safety_briefing_attendance"("workerId");

-- CreateIndex
CREATE INDEX "schedule_scenario_task_overrides_taskId_idx" ON "schedule_scenario_task_overrides"("taskId");

-- CreateIndex
CREATE INDEX "service_contracts_clientId_idx" ON "service_contracts"("clientId");

-- CreateIndex
CREATE INDEX "service_visits_technicianWorkerId_idx" ON "service_visits"("technicianWorkerId");

-- CreateIndex
CREATE INDEX "signature_requests_createdByUserId_idx" ON "signature_requests"("createdByUserId");

-- CreateIndex
CREATE INDEX "stock_count_lines_materialCatalogItemId_idx" ON "stock_count_lines"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_kit_components_materialCatalogItemId_idx" ON "stock_kit_components"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_levels_materialCatalogItemId_idx" ON "stock_levels"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_lots_materialCatalogItemId_idx" ON "stock_lots"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_movements_estimateLineId_idx" ON "stock_movements"("estimateLineId");

-- CreateIndex
CREATE INDEX "stock_movements_materialCatalogItemId_idx" ON "stock_movements"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_movements_projectId_idx" ON "stock_movements"("projectId");

-- CreateIndex
CREATE INDEX "stock_reservations_materialCatalogItemId_idx" ON "stock_reservations"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_reservations_projectId_idx" ON "stock_reservations"("projectId");

-- CreateIndex
CREATE INDEX "stock_transfers_materialCatalogItemId_idx" ON "stock_transfers"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "subcontractor_backcharges_punchListItemId_idx" ON "subcontractor_backcharges"("punchListItemId");

-- CreateIndex
CREATE INDEX "subcontractor_performance_reviews_assignmentId_idx" ON "subcontractor_performance_reviews"("assignmentId");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "supplier_return_lines_materialCatalogItemId_idx" ON "supplier_return_lines"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "supplier_return_lines_stockMovementId_idx" ON "supplier_return_lines"("stockMovementId");

-- CreateIndex
CREATE INDEX "supplier_returns_warehouseId_idx" ON "supplier_returns"("warehouseId");

-- CreateIndex
CREATE INDEX "support_tickets_assignedToUserId_idx" ON "support_tickets"("assignedToUserId");

-- CreateIndex
CREATE INDEX "takeoff_measurements_rateCatalogItemId_idx" ON "takeoff_measurements"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "takeoffs_sourceSheetId_idx" ON "takeoffs"("sourceSheetId");

-- CreateIndex
CREATE INDEX "task_dependencies_successorId_idx" ON "task_dependencies"("successorId");

-- CreateIndex
CREATE INDEX "tasks_estimateLineId_idx" ON "tasks"("estimateLineId");

-- CreateIndex
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- CreateIndex
CREATE INDEX "tool_crib_units_materialCatalogItemId_idx" ON "tool_crib_units"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "units_of_measure_baseUnitId_idx" ON "units_of_measure"("baseUnitId");

-- CreateIndex
CREATE INDEX "vendor_bill_lines_materialCatalogItemId_idx" ON "vendor_bill_lines"("materialCatalogItemId");

-- CreateIndex
CREATE INDEX "warehouse_locations_parentId_idx" ON "warehouse_locations"("parentId");

-- CreateIndex
CREATE INDEX "warranty_claims_assigneeWorkerId_idx" ON "warranty_claims"("assigneeWorkerId");

-- CreateIndex
CREATE INDEX "warranty_claims_submittedByClientId_idx" ON "warranty_claims"("submittedByClientId");

-- CreateIndex
CREATE INDEX "workers_userId_idx" ON "workers"("userId");

-- CreateIndex
CREATE INDEX "workers_wageClassificationId_idx" ON "workers"("wageClassificationId");

