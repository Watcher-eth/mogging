import { SkeletonImage } from '@/components/ui/skeleton-image'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiPatch, ApiClientError } from '@/lib/api/client'
import type { HairColor, SkinColor } from '@/lib/appearance/types'
import { countryOptions, usRegionOptions } from '@/lib/geo/regions'
import type { CurrentUserDashboard, AnonymousProfile } from './app-shell'

const CameraSheet = dynamic(() => import('@/components/analysis/camera-sheet').then(module => module.CameraSheet), { ssr: false })

type ProfileDialogValues = {
  imageData?: string | null
  name: string
  social: string | null
  gender: 'male' | 'female' | null
  age: number | null
  hairColor: HairColor | null
  skinColor: SkinColor | null
  country: string | null
  state: string | null
}

export function EditProfileDialog({
  dashboard,
  description = 'Update the name, location, image, and social link shown around the app.',
  initialProfile,
  onOpenChange,
  onSaved,
  onSaveProfile,
  open,
  title = 'Edit profile.',
}: {
  dashboard: CurrentUserDashboard | null
  description?: string
  initialProfile?: {
    image: string | null
    name: string | null
    social: string | null
    gender: 'male' | 'female' | null
    age: number | null
    hairColor: HairColor | null
    skinColor: SkinColor | null
    country: string | null
    state: string | null
  } | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onSaveProfile?: (values: ProfileDialogValues) => Promise<void>
  open: boolean
  title?: string
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [socialLink, setSocialLink] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | null>(null)
  const [age, setAge] = useState<number | null>(null)
  const [hairColor, setHairColor] = useState<HairColor | null>(null)
  const [skinColor, setSkinColor] = useState<SkinColor | null>(null)
  const [country, setCountry] = useState('US')
  const [state, setState] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    setAvatarDataUrl(null)
    setDisplayName(initialProfile?.name ?? dashboard?.user.name ?? '')
    setSocialLink(initialProfile?.social ?? dashboard?.user.instagramUsername ?? '')
    setGender(initialProfile?.gender ?? dashboard?.user.gender ?? null)
    setAge(initialProfile?.age ?? dashboard?.user.age ?? null)
    setHairColor(initialProfile?.hairColor ?? dashboard?.user.hairColor ?? null)
    setSkinColor(initialProfile?.skinColor ?? dashboard?.user.skinColor ?? null)
    setCountry(initialProfile?.country ?? dashboard?.user.country ?? 'US')
    setState(initialProfile?.state ?? dashboard?.user.state ?? '')
  }, [
    dashboard?.user.age,
    dashboard?.user.gender,
    dashboard?.user.hairColor,
    dashboard?.user.instagramUsername,
    dashboard?.user.name,
    dashboard?.user.skinColor,
    dashboard?.user.country,
    dashboard?.user.state,
    initialProfile?.age,
    initialProfile?.gender,
    initialProfile?.hairColor,
    initialProfile?.name,
    initialProfile?.skinColor,
    initialProfile?.social,
    initialProfile?.country,
    initialProfile?.state,
    open,
  ])

  async function inferProfileAppearance(dataUrl: string) {
    const appearance = await import('@/lib/client/appearance').catch(() => null)
    if (!appearance) return
    const { inferHairColorFromDataUrl, inferSkinColorFromDataUrl } = appearance
    try {
      const { extractFaceLandmarksFromDataUrl } = await import('@/lib/client/faceLandmarks')
      const landmarks = await extractFaceLandmarksFromDataUrl(dataUrl)
      const [inferredHairColor, inferredSkinColor] = await Promise.all([
        inferHairColorFromDataUrl(dataUrl, landmarks),
        inferSkinColorFromDataUrl(dataUrl, landmarks),
      ])
      setHairColor(inferredHairColor)
      setSkinColor(inferredSkinColor)
    } catch {
      const inferredHairColor = await inferHairColorFromDataUrl(dataUrl)
      setHairColor(inferredHairColor)
      setSkinColor(null)
    }
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const dataUrl = await readFileAsDataUrl(file)
    setAvatarDataUrl(dataUrl)
    void inferProfileAppearance(dataUrl)
  }

  async function saveProfile() {
    if (!displayName.trim()) return

    setSaving(true)
    try {
      if (onSaveProfile) {
        await onSaveProfile({
          ...(avatarDataUrl ? { imageData: avatarDataUrl } : null),
          name: displayName.trim(),
          social: socialLink.trim() || null,
          gender,
          age,
          hairColor,
          skinColor,
          country,
          state: country === 'US' ? state || null : null,
        })
      } else {
        await apiPatch('/api/user/me', {
          ...(avatarDataUrl ? { imageData: avatarDataUrl } : null),
          age,
          gender,
          hairColor,
          skinColor,
          country,
          state: country === 'US' ? state || null : null,
          instagramUsername: socialLink.trim() || null,
          name: displayName.trim(),
        })
      }
      await onSaved()
      toast.success('Profile updated')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Unable to update profile')
    } finally {
      setSaving(false)
    }
  }

  const avatarPreview = avatarDataUrl ?? initialProfile?.image ?? dashboard?.user.image ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100svh-2rem))] max-w-[430px] overflow-hidden rounded-[34px] border border-white bg-white p-0 shadow-[0_32px_120px_rgba(15,23,42,0.24)]">
        <div className="relative grid content-start gap-5 overflow-y-auto px-7 pb-7 pt-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_70%_48%_at_50%_10%,rgba(244,244,245,0.82)_0%,rgba(255,255,255,0)_72%)]" />

          <DialogHeader className="relative text-left">
            <DialogTitle className="text-4xl font-semibold leading-[1.02] tracking-[-0.06em]">{title}</DialogTitle>
            <DialogDescription className="mt-3 text-left text-sm leading-6 text-zinc-500">
              {description}
            </DialogDescription>
          </DialogHeader>

          <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={handleAvatarFile} />

          <div className="relative grid justify-items-center gap-3">
            <button
              className="group relative size-32 overflow-hidden rounded-full border-2 border-white bg-zinc-100 shadow-[0_22px_60px_rgba(15,23,42,0.16)]"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {avatarPreview ? (
                <SkeletonImage className="object-cover transition-transform duration-300 group-hover:scale-105" src={avatarPreview} alt="Profile avatar preview" sizes="128px" unoptimized={avatarPreview.startsWith('data:')} />
              ) : (
                <span className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Upload</span>
              )}
            </button>
            <div className="flex gap-2">
              <button className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-black" onClick={() => fileInputRef.current?.click()} type="button">
                Upload
              </button>
              <button className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-black" onClick={() => setCameraOpen(true)} type="button">
                Camera
              </button>
            </div>
          </div>

          <label className="relative grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Name</span>
            <input
              className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none transition-colors focus:border-black"
              maxLength={100}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your display name"
              value={displayName}
            />
          </label>

          <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Country</span>
              <select
                className="h-12 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-medium text-black outline-none transition-colors focus:border-black"
                onChange={(event) => {
                  setCountry(event.target.value)
                  if (event.target.value !== 'US') setState('')
                }}
                value={country}
              >
                {countryOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">State / region</span>
              <select
                className="h-12 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-medium text-black outline-none transition-colors focus:border-black disabled:bg-zinc-100 disabled:text-zinc-400"
                disabled={country !== 'US'}
                onChange={(event) => setState(event.target.value)}
                value={state}
              >
                <option value="">Select</option>
                {usRegionOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
          </div>

          <label className="relative grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Social link</span>
            <input
              className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none transition-colors focus:border-black"
              maxLength={160}
              onChange={(event) => setSocialLink(event.target.value)}
              placeholder="instagram.com/name or tiktok.com/@name"
              value={socialLink}
            />
          </label>

          <button
            className="relative flex h-14 w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-5 text-base font-semibold text-black shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.11)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
            disabled={!displayName.trim() || !country || (country === 'US' && !state) || saving}
            onClick={() => void saveProfile()}
            type="button"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save profile
          </button>
        </div>
      </DialogContent>
      {open && <CameraSheet
        open={cameraOpen}
        onCapture={(image) => {
          setAvatarDataUrl(image.dataUrl)
          void inferProfileAppearance(image.dataUrl)
        }}
        onClose={() => setCameraOpen(false)}
        onUpload={() => {
          setCameraOpen(false)
          window.setTimeout(() => fileInputRef.current?.click(), 160)
        }}
      />}
    </Dialog>
  )
}

export function ProfileSetupDialog({
  dashboard,
  onOpenChange,
  onSaved,
  open,
}: {
  dashboard: CurrentUserDashboard | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  open: boolean
}) {
  return (
    <EditProfileDialog
      dashboard={dashboard}
      description="Set the name, location, image, and social link people will see on rankings."
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      title="Set your profile."
    />
  )
}

export function AnonymousProfileDialog({
  onOpenChange,
  onSaved,
  open,
  profile,
}: {
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  open: boolean
  profile: AnonymousProfile | null
}) {
  return (
    <EditProfileDialog
      dashboard={null}
      description="Set the name, location, image, and social link people will see on rankings."
      initialProfile={
        profile
          ? {
              age: profile.age,
              gender: profile.gender,
              hairColor: profile.hairColor,
              skinColor: profile.skinColor,
              country: profile.country,
              state: profile.state,
              image: profile.image,
              name: profile.name,
              social: profile.social,
            }
          : null
      }
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      onSaveProfile={(values) =>
        apiPatch('/api/auth/anonymous-profile', {
          ...(values.imageData ? { imageData: values.imageData } : null),
          age: values.age,
          gender: values.gender,
          hairColor: values.hairColor,
          skinColor: values.skinColor,
          country: values.country,
          state: values.state,
          name: values.name,
          social: values.social,
        })
      }
      title="Set your profile."
    />
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image file'))
        return
      }

      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
