import { useRef } from "react";
import { Check, ChevronDown, Copy, Link2, Loader2, Trash2, Users } from "lucide-react";

import { Button } from "@/client/components/ui/button";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import { deriveShareDialogRowAffordance } from "@/client/lib/affordance/share-dialog";
import type { PageShare } from "@/shared/types";

import { useShareDialogShell, useShareLink, useSharePeople } from "./context";
import type { SharePermission, WorkspaceRole } from "./types";

function PermissionSelect({ value, onChange }: { value: SharePermission; onChange: (v: SharePermission) => void }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SharePermission)}
        className="appearance-none rounded-md border border-zinc-700 bg-zinc-800 py-1 pl-2 pr-6 text-sm text-zinc-300 outline-none focus:border-zinc-600"
      >
        <option value="view">View</option>
        <option value="edit">Edit</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}

export function SharePeopleSection() {
  const { creating, dialogAffordance, workspaceRole, online, currentUserId, deleteShare } = useShareDialogShell();
  const {
    peopleInput,
    peoplePermission,
    showSuggestions,
    userShares,
    members,
    filteredSuggestions,
    hasMatchedMember,
    memberName,
    granteeName,
    setPeopleInput,
    setPeoplePermission,
    openSuggestions,
    dismissSuggestions,
    selectMember,
    submitPeopleShare,
  } = useSharePeople();

  // Member role cannot invite by free-form email; the worker rejects it.
  // Surface that as an affordance: placeholder says "search", and submit
  // stays disabled until the input resolves to an actual workspace member.
  const placeholder = dialogAffordance.shareByEmail ? "Name or email..." : "Teammate...";
  const ariaLabel = dialogAffordance.shareByEmail
    ? "Search people to share with"
    : "Search workspace members to share with";
  const submitGuardedByMemberMatch = !dialogAffordance.shareByEmail && !hasMatchedMember;
  const submitDisabled =
    creating || !peopleInput.trim() || !isActionEnabled(dialogAffordance.createUserShare) || submitGuardedByMemberMatch;
  const submitTitle =
    dialogAffordance.createUserShare.kind === "disabled"
      ? dialogAffordance.createUserShare.reason
      : submitGuardedByMemberMatch
        ? "Members only"
        : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsOpen = showSuggestions && filteredSuggestions.length > 0 && peopleInput.trim().length > 0;

  return (
    <div className="mb-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
        <Users className="h-3 w-3" />
        People
      </p>
      <div className="mb-2 flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={peopleInput}
          onChange={(e) => {
            setPeopleInput(e.target.value);
            openSuggestions();
          }}
          onFocus={openSuggestions}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void submitPeopleShare();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 py-1.5 pl-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30"
        />
        <PermissionSelect value={peoplePermission} onChange={setPeoplePermission} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void submitPeopleShare()}
          disabled={submitDisabled}
          title={submitTitle}
          className="shrink-0"
          loading={creating}
        >
          Share
        </Button>
      </div>
      {suggestionsOpen && (
        <DropdownPortal
          triggerRef={inputRef}
          align="left"
          widthMode="match-trigger"
          onClose={dismissSuggestions}
          className="max-h-32 overflow-y-auto py-1"
        >
          {filteredSuggestions.map((member) => (
            <button
              key={member.user_id}
              onClick={() => selectMember(member)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              <span className="truncate">{memberName(member)}</span>
              {member.user?.email && member.user.name && (
                <span className="truncate text-zinc-500">{member.user.email}</span>
              )}
            </button>
          ))}
        </DropdownPortal>
      )}
      {userShares.length > 0 ? (
        <div className="space-y-1">
          {userShares.map((share) => (
            <ShareUserRow
              key={share.id}
              share={share}
              label={granteeName(share)}
              workspaceRole={workspaceRole}
              online={online}
              currentUserId={currentUserId}
              granteeIsWorkspaceMember={members.some((member) => member.user_id === share.grantee_id)}
              onDelete={() => void deleteShare(share.id)}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 text-sm text-zinc-400">No people shares</p>
      )}
    </div>
  );
}

export function ShareLinkSection() {
  const { creating, dialogAffordance, workspaceRole, online, currentUserId, deleteShare } = useShareDialogShell();
  const { linkPermission, linkShares, copiedId, setLinkPermission, createLinkShare, copyLink } = useShareLink();

  return (
    <div className={dialogAffordance.showPeopleSection ? "border-t border-zinc-700/50 pt-3" : ""}>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
        <Link2 className="h-3 w-3" />
        Link
      </p>
      {isActionVisible(dialogAffordance.createLinkShare) && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            onClick={() => void createLinkShare()}
            disabled={creating || !isActionEnabled(dialogAffordance.createLinkShare)}
            title={
              dialogAffordance.createLinkShare.kind === "disabled" ? dialogAffordance.createLinkShare.reason : undefined
            }
            className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-zinc-700 px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700/40 hover:text-zinc-100 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Create link
          </button>
          <PermissionSelect value={linkPermission} onChange={setLinkPermission} />
        </div>
      )}
      {linkShares.length > 0 ? (
        <div className="space-y-1">
          {linkShares.map((share) => (
            <ShareLinkRow
              key={share.id}
              share={share}
              copiedId={copiedId}
              workspaceRole={workspaceRole}
              online={online}
              currentUserId={currentUserId}
              onCopy={() => copyLink(share)}
              onDelete={() => void deleteShare(share.id)}
            />
          ))}
        </div>
      ) : (
        isActionVisible(dialogAffordance.createLinkShare) && (
          <p className="px-2 text-sm text-zinc-400">No link shares</p>
        )
      )}
    </div>
  );
}

function ShareUserRow({
  share,
  label,
  workspaceRole,
  online,
  currentUserId,
  granteeIsWorkspaceMember,
  onDelete,
}: {
  share: PageShare;
  label: string;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  granteeIsWorkspaceMember: boolean;
  onDelete: () => void;
}) {
  const rowAffordance = deriveShareDialogRowAffordance({
    workspaceRole,
    online,
    currentUserId,
    share,
    granteeIsWorkspaceMember,
  });

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-700/40">
      <div className="flex items-center gap-2 overflow-hidden">
        <Users className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-sm text-zinc-300">{label}</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">{share.permission}</span>
      </div>
      {isActionVisible(rowAffordance.revoke) && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onDelete}
          disabled={!isActionEnabled(rowAffordance.revoke)}
          title={rowAffordance.revoke.kind === "disabled" ? rowAffordance.revoke.reason : undefined}
          aria-label="Remove share"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          className="hover:text-red-400"
        />
      )}
    </div>
  );
}

function ShareLinkRow({
  share,
  copiedId,
  workspaceRole,
  online,
  currentUserId,
  onCopy,
  onDelete,
}: {
  share: PageShare;
  copiedId: string | null;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const rowAffordance = deriveShareDialogRowAffordance({
    workspaceRole,
    online,
    currentUserId,
    share,
    granteeIsWorkspaceMember: false,
  });

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-zinc-700/40">
      <div className="flex items-center gap-2 overflow-hidden">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-sm text-zinc-300">{share.permission} link</span>
      </div>
      <div className="flex items-center gap-1">
        {isActionVisible(rowAffordance.copyLink) && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onCopy}
            aria-label="Copy link"
            icon={
              copiedId === share.id ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )
            }
          />
        )}
        {isActionVisible(rowAffordance.revoke) && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onDelete}
            disabled={!isActionEnabled(rowAffordance.revoke)}
            title={rowAffordance.revoke.kind === "disabled" ? rowAffordance.revoke.reason : undefined}
            aria-label="Remove link"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            className="hover:text-red-400"
          />
        )}
      </div>
    </div>
  );
}
