import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { GeneratedImageItem } from '../types';
import { parseJsonResponse } from '../utils/apiFetch';

interface ImageGenTabProps {
  onCopyText: (value: string, label: string) => void;
  onShowToast: (message: string) => void;
}

const STYLE_OPTIONS = [
  { id: 'none', label: 'Natural' },
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: '3d', label: '3D Render' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'anime', label: 'Anime' },
  { id: 'logo', label: 'Minimal Logo' },
];

const ASPECT_OPTIONS = [
  { id: '1:1', label: '1:1 Square' },
  { id: '16:9', label: '16:9 Wide' },
  { id: '9:16', label: '9:16 Portrait' },
  { id: '4:3', label: '4:3 Classic' },
  { id: '3:4', label: '3:4 Vertical' },
];

const PROMPT_SUGGESTIONS = [
  'Luxury black and gold futuristic smartphone product photography, dramatic studio lighting',
  'Minimalist flat gold vault shield emblem icon on deep obsidian background',
  'Vibrant Lagos skyline at golden sunset, warm cinematic reflections',
  'Cyberpunk neon coffee shop in rain, glowing reflections, cozy atmosphere',
];

const GALLERY_STORAGE_KEY = 'veribox_generated_images_v1';

function loadStoredGallery(): GeneratedImageItem[] {
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeneratedImageItem[]) : [];
  } catch {
    return [];
  }
}

function saveStoredGallery(items: GeneratedImageItem[]) {
  const list = items.slice(0, 6);
  for (let count = list.length; count >= 0; count--) {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(list.slice(0, count)));
      return;
    } catch {
      // Trim oldest if localStorage quota is tight
    }
  }
}

const IMAGE_DIMENSIONS_CLIENT: Record<string, { width: number; height: number }> = {
  '1:1': { width: 512, height: 512 },
  '16:9': { width: 576, height: 320 },
  '9:16': { width: 320, height: 576 },
  '4:3': { width: 576, height: 448 },
  '3:4': { width: 448, height: 576 },
};

const STYLE_PROMPT_SUFFIX_CLIENT: Record<string, string> = {
  none: '',
  photorealistic: ', photorealistic, ultra sharp, natural lighting, 8k DSLR photograph',
  '3d': ', 3D octane render, cinema4d, soft studio lighting, polished materials',
  cyberpunk: ', cyberpunk neon city aesthetic, moody rain reflections, volumetric glow',
  anime: ', high quality modern anime illustration, crisp lineart, vibrant cel shading',
  logo: ', clean minimalist vector logo design, centered composition, sharp flat shapes',
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not decode generated image'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

async function generateDirectPollinationsFallback(
  rawPrompt: string,
  style: string,
  aspectRatio: string
): Promise<string> {
  const dims = IMAGE_DIMENSIONS_CLIENT[aspectRatio] || IMAGE_DIMENSIONS_CLIENT['1:1'];
  const suffix = STYLE_PROMPT_SUFFIX_CLIENT[style] || '';
  const enhancedPrompt = `${rawPrompt.slice(0, 650)}${suffix}`;
  const seed = Math.floor(Math.random() * 9999999);
  const directUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    enhancedPrompt
  )}?width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;

  const response = await fetch(directUrl, {
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) {
    throw new Error(`Direct image engine returned ${response.status}`);
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    throw new Error('Upstream did not return a valid image');
  }
  const blob = await response.blob();
  if (blob.size < 1024) {
    throw new Error('Generated image was empty');
  }
  return blobToDataUrl(blob);
}

export function ImageGenTab({ onCopyText, onShowToast }: ImageGenTabProps) {
  const [prompt, setPrompt] = useState<string>('');
  const [style, setStyle] = useState<string>('photorealistic');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [generating, setGenerating] = useState<boolean>(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedImageItem[]>(() => loadStoredGallery());
  const [activeImage, setActiveImage] = useState<GeneratedImageItem | null>(
    () => loadStoredGallery()[0] || null
  );

  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    saveStoredGallery(gallery);
  }, [gallery]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const pushNewImage = (item: GeneratedImageItem) => {
    setActiveImage(item);
    setGallery((prev) => [item, ...prev.filter((g) => g.id !== item.id)].slice(0, 6));
  };

  const handleGenerate = async (overridePrompt?: string) => {
    const finalPrompt = (overridePrompt ?? prompt).trim();
    if (finalPrompt.length < 3) {
      setError('Please enter a prompt with at least 3 characters.');
      return;
    }

    abortRef.current = false;
    setGenerating(true);
    setError(null);
    setQueueStatus('Sending request to free image engine...');

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          style,
          aspectRatio,
        }),
      });

      const data = await parseJsonResponse<{
        status?: 'done' | 'pending';
        jobId?: string;
        imageDataUrl?: string;
        provider?: string;
        queuePosition?: number;
        waitTime?: number;
        error?: string;
      }>(res);

      if (!res.ok) {
        throw new Error(data.error || 'Image generation failed');
      }

      if (data.status === 'done' && data.imageDataUrl) {
        const item: GeneratedImageItem = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: finalPrompt,
          style,
          aspectRatio,
          imageDataUrl: data.imageDataUrl,
          provider: data.provider || 'Free AI',
          createdAt: new Date().toISOString(),
        };
        pushNewImage(item);
        onShowToast('Image generated!');
        return;
      }

      if (data.status === 'pending' && data.jobId) {
        const jobId = data.jobId;
        const maxWaitUntil = Date.now() + 90000;
        setQueueStatus(
          data.queuePosition && data.queuePosition > 0
            ? `Queued (#${data.queuePosition}) · Rendering free image...`
            : 'Rendering your image...'
        );

        while (Date.now() < maxWaitUntil && !abortRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (abortRef.current) return;

          const statusRes = await fetch(`/api/images/status/${encodeURIComponent(jobId)}`);
          const statusData = await parseJsonResponse<{
            status?: 'done' | 'pending';
            imageDataUrl?: string;
            provider?: string;
            queuePosition?: number;
            waitTime?: number;
            error?: string;
          }>(statusRes);

          if (!statusRes.ok) {
            throw new Error(statusData.error || 'Image rendering failed');
          }

          if (statusData.status === 'done' && statusData.imageDataUrl) {
            const item: GeneratedImageItem = {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              prompt: finalPrompt,
              style,
              aspectRatio,
              imageDataUrl: statusData.imageDataUrl,
              provider: statusData.provider || 'Free AI',
              createdAt: new Date().toISOString(),
            };
            pushNewImage(item);
            onShowToast('Image generated!');
            return;
          }

          setQueueStatus(
            statusData.queuePosition && statusData.queuePosition > 0
              ? `In free render queue (#${statusData.queuePosition}) · ~${Math.max(
                  3,
                  statusData.waitTime || 10
                )}s left`
              : `Rendering image · ~${Math.max(3, statusData.waitTime || 8)}s left`
          );
        }

        if (!abortRef.current) {
          throw new Error('Image generation timed out. Please try again.');
        }
        return;
      }

      throw new Error('Unexpected response from image generator');
    } catch (serverErr) {
      if (abortRef.current) return;
      try {
        setQueueStatus('Switching to direct free image renderer...');
        const fallbackDataUrl = await generateDirectPollinationsFallback(
          finalPrompt,
          style,
          aspectRatio
        );
        if (abortRef.current) return;
        const item: GeneratedImageItem = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: finalPrompt,
          style,
          aspectRatio,
          imageDataUrl: fallbackDataUrl,
          provider: 'pollinations',
          createdAt: new Date().toISOString(),
        };
        pushNewImage(item);
        onShowToast('Image generated!');
      } catch (fallbackErr) {
        if (!abortRef.current) {
          const msg =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : serverErr instanceof Error
                ? serverErr.message
                : 'Unable to generate image right now.';
          setError(msg);
        }
      }
    } finally {
      if (!abortRef.current) {
        setGenerating(false);
        setQueueStatus(null);
      }
    }
  };

  const handleDownload = (item: GeneratedImageItem) => {
    try {
      const link = document.createElement('a');
      link.href = item.imageDataUrl;
      const slug = item.prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32)
        .replace(/^-|-$/g, '');
      const ext = item.imageDataUrl.includes('image/png')
        ? 'png'
        : item.imageDataUrl.includes('image/jpeg')
        ? 'jpg'
        : 'webp';
      link.download = `veribox-${slug || 'image'}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast('Image downloaded');
    } catch {
      onShowToast('Unable to download image');
    }
  };

  const handleDeleteImage = (id: string) => {
    setGallery((prev) => {
      const remaining = prev.filter((item) => item.id !== id);
      if (activeImage?.id === id) {
        setActiveImage(remaining[0] || null);
      }
      return remaining;
    });
    onShowToast('Image removed');
  };

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <section className="rounded-3xl border border-[#D4AF37]/30 bg-white p-4 sm:p-6 shadow-sm dark:bg-[#14120D]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg sm:text-xl font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                Free Image Generator
              </h1>
              <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                Create crisp images &amp; profile visuals free — zero credits deducted
              </p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
            100% Free Unlimited
          </span>
        </div>

        {/* Prompt Box */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="image-prompt-input"
              className="mb-1.5 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]"
            >
              Describe the image you want to create
            </label>
            <textarea
              id="image-prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Minimalist luxury gold and obsidian app logo emblem, studio lighting..."
              className="w-full rounded-2xl border border-[#D4AF37]/35 bg-[#FAF7F0] p-3.5 text-sm text-[#1A160D] placeholder:text-[#8F8673] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
            />
          </div>

          {/* Quick Prompt Ideas */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
              Quick Ideas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(suggestion);
                    setError(null);
                  }}
                  className="rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-2.5 py-1.5 text-left text-[11px] font-medium text-[#3E3522] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/15 dark:bg-[#0B0A07] dark:text-[#D5CCB8]"
                >
                  {suggestion.slice(0, 48)}...
                </button>
              ))}
            </div>
          </div>

          {/* Style & Aspect Ratio Controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">Style</p>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_OPTIONS.map((opt) => {
                  const selected = style === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStyle(opt.id)}
                      className={`min-h-[36px] rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                        selected
                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                          : 'border-[#D4AF37]/25 bg-[#FAF7F0] text-[#3E3522] hover:bg-[#D4AF37]/10 dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                Aspect Ratio
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_OPTIONS.map((opt) => {
                  const selected = aspectRatio === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAspectRatio(opt.id)}
                      className={`min-h-[36px] rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                        selected
                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                          : 'border-[#D4AF37]/25 bg-[#FAF7F0] text-[#3E3522] hover:bg-[#D4AF37]/10 dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-700 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Generate CTA */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={generating || prompt.trim().length < 3}
              onClick={() => void handleGenerate()}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-5 py-3 text-sm font-extrabold text-[#0A0906] shadow-lg shadow-[#D4AF37]/20 transition-all hover:bg-[#E5C150] active:scale-[0.98] disabled:opacity-60 cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{queueStatus || 'Generating Image...'}</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  <span>Generate Free Image</span>
                </>
              )}
            </button>

            {generating && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current = true;
                  setGenerating(false);
                  setQueueStatus(null);
                }}
                className="min-h-[48px] rounded-2xl border border-[#D4AF37]/35 px-4 text-xs font-bold text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Active Result Viewer */}
      <section className="rounded-3xl border border-[#D4AF37]/30 bg-white p-4 sm:p-6 shadow-sm dark:bg-[#14120D]">
        {generating && !activeImage ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] mb-4">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <p className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
              {queueStatus || 'Creating your artwork...'}
            </p>
            <p className="mt-1 text-xs text-[#6E6552] dark:text-[#A89F8C]">
              Usually completes in 8–20 seconds
            </p>
          </div>
        ) : activeImage ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[#0B0A07] flex items-center justify-center">
              <img
                src={activeImage.imageDataUrl}
                alt={activeImage.prompt}
                className="max-h-[520px] w-full object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#1A160D] line-clamp-2 dark:text-[#FAF6EC]">
                  {activeImage.prompt}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                  {activeImage.aspectRatio} · {activeImage.style} · {activeImage.provider}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(activeImage)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  disabled={generating}
                  onClick={() => {
                    setPrompt(activeImage.prompt);
                    void handleGenerate(activeImage.prompt);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-2 text-xs font-bold text-[#3E3522] hover:bg-[#D4AF37]/10 disabled:opacity-50 dark:text-[#FAF6EC]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Regenerate</span>
                </button>

                <button
                  type="button"
                  onClick={() => onCopyText(activeImage.prompt, 'Prompt copied!')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-2 text-xs font-bold text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#FAF6EC]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Prompt</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#9A6F09] dark:text-[#F5D77A] mb-3">
              <ImageIcon className="h-7 w-7" />
            </div>
            <p className="font-display text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
              Your generated image will appear here
            </p>
            <p className="mt-1 max-w-sm text-xs text-[#6E6552] dark:text-[#A89F8C]">
              Type any prompt above or tap a quick idea, then press Generate Free Image.
            </p>
          </div>
        )}
      </section>

      {/* Recent Creations */}
      {gallery.length > 0 && (
        <section className="rounded-3xl border border-[#D4AF37]/25 bg-white p-4 sm:p-5 shadow-sm dark:bg-[#14120D]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Recent Creations ({gallery.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setGallery([]);
                setActiveImage(null);
                onShowToast('Gallery cleared');
              }}
              className="text-xs font-bold text-[#6E6552] hover:text-rose-500 dark:text-[#A89F8C]"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.map((item) => {
              const isSelected = activeImage?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`group relative overflow-hidden rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/40'
                      : 'border-[#D4AF37]/20 hover:border-[#D4AF37]/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveImage(item)}
                    className="block w-full aspect-square bg-[#0B0A07] overflow-hidden"
                  >
                    <img
                      src={item.imageDataUrl}
                      alt={item.prompt}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete generated image"
                    onClick={() => handleDeleteImage(item.id)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-90 hover:bg-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
