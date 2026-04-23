-- Phase 11: capability exposure metadata (API/MCP/both) + MCP configuration fields

ALTER TABLE resource_definitions ADD COLUMN capability_exposure TEXT NULL;
ALTER TABLE resource_definitions ADD COLUMN mcp_name TEXT NULL;
ALTER TABLE resource_definitions ADD COLUMN mcp_description TEXT NULL;
ALTER TABLE resource_definitions ADD COLUMN mcp_type TEXT NULL;
ALTER TABLE resource_definitions ADD COLUMN mcp_requires_payment INTEGER NULL;
