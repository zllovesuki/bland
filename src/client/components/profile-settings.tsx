import { useState, useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Save, Loader2, Camera, X, User as UserIcon } from "lucide-react";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api, toApiError } from "@/client/lib/api";

export function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasChanges = name.trim() !== (user?.name ?? "") || (avatarUrl.trim() || null) !== (user?.avatar_url ?? null);

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentWorkspace) return;

      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        setError("Image must be under 2MB");
        return;
      }

      setUploading(true);
      setError(null);
      try {
        const presign = await api.uploads.presign(currentWorkspace.id, {
          filename: file.name,
          content_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          size_bytes: file.size,
        });
        await api.uploads.uploadData(presign.upload_url, file);
        setAvatarUrl(presign.url);
      } catch (err) {
        setError(toApiError(err).message);
      } finally {
        setUploading(false);
      }
    },
    [currentWorkspace],
  );

  const handleSave = useCallback(async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await api.profile.update({
        name: name.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      useAuthStore.getState().setAuth(useAuthStore.getState().accessToken!, updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  }, [name, avatarUrl, saving]);

  if (!user) return null;

  const backSlug = currentWorkspace?.slug;

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      {backSlug ? (
        <Link
          to="/$workspaceSlug"
          params={{ workspaceSlug: backSlug }}
          className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      ) : (
        <Link to="/" className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      )}

      <h1 className="mb-8 text-xl font-semibold text-zinc-100">Profile</h1>

      <div className="space-y-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-800">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-8 w-8 text-zinc-500" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50"
              title="Change avatar"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-zinc-400">Profile photo</p>
            <p className="text-xs text-zinc-600">JPG, PNG, GIF, or WebP. Max 2MB.</p>
            {avatarUrl && (
              <button
                onClick={() => setAvatarUrl("")}
                className="mt-1 flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-zinc-400">
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-accent-500"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-400">Email</label>
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500">{user.email}</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !hasChanges}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save"}
          </button>
          {success && <span className="text-sm text-green-400">Saved</span>}
        </div>
      </div>
    </div>
  );
}
