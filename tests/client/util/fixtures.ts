import type { User, Workspace, Page, WorkspaceMember } from "@/shared/types";

export const TEST_TIMESTAMP = "2026-04-06T00:00:00.000Z";

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    avatar_url: null,
    created_at: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "Test Workspace",
    slug: "test-workspace",
    icon: null,
    owner_id: "user-1",
    created_at: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function createPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    workspace_id: "ws-1",
    parent_id: null,
    kind: "doc",
    title: "Test Page",
    icon: null,
    cover_url: null,
    position: 0,
    created_by: "user-1",
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    archived_at: null,
    ...overrides,
  };
}

export function createMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    user_id: "user-1",
    workspace_id: "ws-1",
    role: "member",
    joined_at: TEST_TIMESTAMP,
    ...overrides,
  };
}
