import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Copy,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Wand2,
  X,
} from 'lucide-react';
import type { GeneratedImageItem, UserModerationLockoutState } from '../types';
import { parseJsonResponse } from '../utils/apiFetch';

interface ImageGenTabProps {
  isOwnerAdmin?: boolean;
  isAuthenticated?: boolean;
  getAuthToken?: () => Promise<string | null>;
  onModerationBlocked?: (
    status: number,
    payload: {
      code?: string;
      error?: string;
      moderation?: UserModerationLockoutState;
    }
  ) => void;
  onRequireAuth?: (reason?: string) => void;
  onCopyText: (value: string, label: string) => void;
  onShowToast: (message: string) => void;
}

type ChatMode = 'auto' | 'chat' | 'image';

interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  uploadedImageUrl?: string;
  generatedImage?: GeneratedImageItem;
  generatingImage?: boolean;
  queueStatus?: string | null;
  provider?: string;
  error?: string;
  createdAt: string;
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
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
];

const STARTER_CHIPS: Array<{ label: string; text: string; mode?: ChatMode }> = [
  {
    label: 'Tell me about VeriBox app',
    text: 'Tell me about the VeriBox app and all its features.',
    mode: 'chat',
  },
  {
    label: 'Generate gold 3D lion logo',
    text: 'Generate a minimalist luxury black and gold lion shield logo icon, 3D studio lighting',
    mode: 'image',
  },
  {
    label: 'How do @veribox.name.ng emails work?',
    text: 'How do @veribox.name.ng custom emails work and how do I create or recover one?',
    mode: 'chat',
  },
  {
    label: 'Draw Lagos sunset skyline',
    text: 'Draw a vibrant futuristic Lagos skyline at golden sunset with warm reflections',
    mode: 'image',
  },
];

const GALLERY_STORAGE_KEY = 'veribox_generated_images_v1';
const CHAT_STORAGE_KEY = 'veribox_ai_chat_messages_v1';

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
  const list = items.slice(0, 8);
  for (let count = list.length; count >= 0; count--) {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(list.slice(0, count)));
      return;
    } catch {
      // Trim oldest if localStorage quota is tight
    }
  }
}

function loadStoredChat(): AiChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as AiChatMessage[]).map((m) => ({
      ...m,
      generatingImage: false,
      queueStatus: null,
    }));
  } catch {
    return [];
  }
}

function saveStoredChat(msgs: AiChatMessage[]) {
  const clean = msgs.slice(-20).map((m) => ({
    ...m,
    generatingImage: false,
    queueStatus: null,
    // Keep uploaded thumbnail light if storage gets tight
  }));
  for (let count = clean.length; count >= 0; count--) {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(clean.slice(-count)));
      return;
    } catch {
      // Strip heavy base64 images on tight quota
      try {
        const light = clean.slice(-count).map((m) => ({
          ...m,
          uploadedImageUrl: undefined,
          generatedImage: undefined,
        }));
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(light));
        return;
      } catch {
        // Keep shrinking
      }
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
        reject(new Error('Could not decode image'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

async function compressUploadedImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WEBP).');
  }
  const rawUrl = await blobToDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 960;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = () => resolve(rawUrl);
    img.src = rawUrl;
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

export function ImageGenTab({
  isOwnerAdmin = false,
  isAuthenticated = true,
  getAuthToken,
  onModerationBlocked,
  onRequireAuth,
  onCopyText,
  onShowToast,
}: ImageGenTabProps) {
  const [viewMode, setViewMode] = useState<'chat' | 'gallery'>('chat');
  const [chatMode, setChatMode] = useState<ChatMode>('auto');
  const [showImageOptions, setShowImageOptions] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [style, setStyle] = useState<string>('photorealistic');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');

  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadStoredChat());
  const [gallery, setGallery] = useState<GeneratedImageItem[]>(() => loadStoredGallery());
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    saveStoredGallery(gallery);
  }, [gallery]);

  useEffect(() => {
    saveStoredChat(messages);
  }, [messages]);

  useEffect(() => {
    if (viewMode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, sending, viewMode]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const updateMessage = (id: string, patch: Partial<AiChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const pushNewGalleryItem = (item: GeneratedImageItem) => {
    setGallery((prev) => [item, ...prev.filter((g) => g.id !== item.id)].slice(0, 8));
  };

  const renderImageIntoMessage = async (
    assistantMsgId: string,
    imagePrompt: string,
    useStyle: string,
    useAspect: string
  ) => {
    const updateStatus = (txt: string) => {
      updateMessage(assistantMsgId, { queueStatus: txt });
    };

    let blockedByModeration = false;
    try {
      updateStatus('Sending to free image studio...');
      const authToken = getAuthToken ? await getAuthToken() : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: imagePrompt,
          style: useStyle,
          aspectRatio: useAspect,
        }),
      });

      const data = await parseJsonResponse<{
        status?: 'done' | 'pending';
        jobId?: string;
        imageDataUrl?: string;
        provider?: string;
        queuePosition?: number;
        waitTime?: number;
        code?: string;
        error?: string;
        moderation?: UserModerationLockoutState;
      }>(res);

      if (res.status === 403 && data?.code === 'ACCOUNT_MODERATED') {
        blockedByModeration = true;
        onModerationBlocked?.(res.status, data);
        updateMessage(assistantMsgId, {
          generatingImage: false,
          queueStatus: null,
          error: data.error || 'Your access to VeriBox has been restricted by the administrator.',
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Image generation failed');
      }

      if (data.status === 'done' && data.imageDataUrl) {
        const item: GeneratedImageItem = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: imagePrompt,
          style: useStyle,
          aspectRatio: useAspect,
          imageDataUrl: data.imageDataUrl,
          provider: data.provider || 'Free AI',
          createdAt: new Date().toISOString(),
        };
        pushNewGalleryItem(item);
        updateMessage(assistantMsgId, {
          generatingImage: false,
          queueStatus: null,
          generatedImage: item,
          provider: item.provider,
        });
        onShowToast('Image ready!');
        return;
      }

      if (data.status === 'pending' && data.jobId) {
        const jobId = data.jobId;
        const maxWaitUntil = Date.now() + 90000;
        updateStatus(
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
              prompt: imagePrompt,
              style: useStyle,
              aspectRatio: useAspect,
              imageDataUrl: statusData.imageDataUrl,
              provider: statusData.provider || 'Free AI',
              createdAt: new Date().toISOString(),
            };
            pushNewGalleryItem(item);
            updateMessage(assistantMsgId, {
              generatingImage: false,
              queueStatus: null,
              generatedImage: item,
              provider: item.provider,
            });
            onShowToast('Image ready!');
            return;
          }

          updateStatus(
            statusData.queuePosition && statusData.queuePosition > 0
              ? `In render queue (#${statusData.queuePosition}) · ~${Math.max(
                  3,
                  statusData.waitTime || 10
                )}s left`
              : `Rendering artwork · ~${Math.max(3, statusData.waitTime || 8)}s left`
          );
        }

        if (!abortRef.current) {
          throw new Error('Image generation timed out. Please try again.');
        }
        return;
      }

      throw new Error('Unexpected response from image studio');
    } catch (serverErr) {
      if (abortRef.current || blockedByModeration) return;
      try {
        updateStatus('Switching to fast direct renderer...');
        const fallbackDataUrl = await generateDirectPollinationsFallback(
          imagePrompt,
          useStyle,
          useAspect
        );
        if (abortRef.current) return;
        const item: GeneratedImageItem = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: imagePrompt,
          style: useStyle,
          aspectRatio: useAspect,
          imageDataUrl: fallbackDataUrl,
          provider: 'Pollinations',
          createdAt: new Date().toISOString(),
        };
        pushNewGalleryItem(item);
        updateMessage(assistantMsgId, {
          generatingImage: false,
          queueStatus: null,
          generatedImage: item,
          provider: item.provider,
        });
        onShowToast('Image ready!');
      } catch (fallbackErr) {
        if (!abortRef.current) {
          const msg =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : serverErr instanceof Error
                ? serverErr.message
                : 'Unable to generate image right now.';
          updateMessage(assistantMsgId, {
            generatingImage: false,
            queueStatus: null,
            error: msg,
          });
        }
      }
    }
  };

  const handleSelectPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGlobalError(null);
    try {
      const compressedDataUrl = await compressUploadedImage(file);
      setAttachedImageUrl(compressedDataUrl);
      setAttachedImageName(file.name || 'Uploaded image');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not attach image';
      setGlobalError(msg);
      onShowToast(msg);
    }
  };

  const handleSendMessage = async (
    overrideText?: string,
    overrideMode?: ChatMode
  ) => {
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to chat with VeriBox AI & generate free images');
      return;
    }

    const activeMode = overrideMode || chatMode;
    const text = (overrideText ?? inputText).trim();
    const photo = attachedImageUrl;

    if (!text && !photo) {
      setGlobalError('Type a message or upload a picture first.');
      return;
    }

    abortRef.current = false;
    setGlobalError(null);
    setSending(true);
    setViewMode('chat');

    const userMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const assistantMsgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const userMsg: AiChatMessage = {
      id: userMsgId,
      role: 'user',
      text: text || 'Analyze this uploaded photo',
      uploadedImageUrl: photo || undefined,
      createdAt: new Date().toISOString(),
    };

    const pendingBotMsg: AiChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      text:
        activeMode === 'image'
          ? 'Creating your image now...'
          : photo
            ? 'Looking at your image...'
            : 'Thinking...',
      generatingImage: activeMode === 'image',
      queueStatus: activeMode === 'image' ? 'Starting free image studio...' : null,
      createdAt: new Date().toISOString(),
    };

    const historySnapshot = messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg, pendingBotMsg]);
    if (!overrideText) {
      setInputText('');
      setAttachedImageUrl(null);
      setAttachedImageName('');
    }

    try {
      // If user explicitly toggled Image mode WITHOUT an uploaded photo, generate right away
      if (activeMode === 'image' && !photo) {
        await renderImageIntoMessage(assistantMsgId, text, style, aspectRatio);
        return;
      }

      // Ask /api/ai/chat (Gemini or VeriBox AI) — handles normal chat, app Q&A, photo vision, and auto image intent!
      const authToken = getAuthToken ? await getAuthToken() : null;
      const chatHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        chatHeaders.Authorization = `Bearer ${authToken}`;
      }
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({
          message: text,
          history: historySnapshot,
          mode: activeMode,
          imageDataUrl: photo || undefined,
          style,
          aspectRatio,
        }),
        signal: AbortSignal.timeout(18000),
      });

      const data = await parseJsonResponse<{
        intent?: 'chat' | 'generate_image';
        reply?: string;
        imagePrompt?: string;
        provider?: string;
        code?: string;
        error?: string;
        moderation?: UserModerationLockoutState;
      }>(res);

      if (res.status === 403 && data?.code === 'ACCOUNT_MODERATED') {
        onModerationBlocked?.(res.status, data);
        updateMessage(assistantMsgId, {
          text: data.error || 'Your access to VeriBox has been restricted by the administrator.',
          generatingImage: false,
          queueStatus: null,
          error: data.error || 'Access restricted',
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Could not reach VeriBox AI');
      }

      const replyText =
        data.reply ||
        (data.intent === 'generate_image'
          ? 'Creating that image for you now...'
          : 'How else can I help you?');

      if (data.intent === 'generate_image') {
        const finalImgPrompt = (data.imagePrompt || text).trim();
        updateMessage(assistantMsgId, {
          text: replyText,
          generatingImage: true,
          queueStatus: 'Rendering free image...',
          provider: data.provider || 'VeriBox AI',
        });
        await renderImageIntoMessage(assistantMsgId, finalImgPrompt, style, aspectRatio);
      } else {
        updateMessage(assistantMsgId, {
          text: replyText,
          generatingImage: false,
          queueStatus: null,
          provider: data.provider || 'VeriBox AI',
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong.';
      updateMessage(assistantMsgId, {
        text: 'Sorry, I ran into a connection hiccup.',
        generatingImage: false,
        queueStatus: null,
        error: errMsg,
      });
    } finally {
      setSending(false);
    }
  };

  const handleRegenerateFromMessage = async (item: GeneratedImageItem) => {
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to regenerate free images');
      return;
    }
    setSending(true);
    const botId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setMessages((prev) => [
      ...prev,
      {
        id: botId,
        role: 'assistant',
        text: 'Regenerating a fresh variation...',
        generatingImage: true,
        queueStatus: 'Starting free image studio...',
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      await renderImageIntoMessage(botId, item.prompt, item.style || style, item.aspectRatio || aspectRatio);
    } finally {
      setSending(false);
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

  const handleDeleteGalleryItem = (id: string) => {
    setGallery((prev) => prev.filter((item) => item.id !== id));
    onShowToast('Image removed from gallery');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="overflow-hidden rounded-3xl border border-[#D4AF37]/30 bg-white shadow-sm dark:bg-[#14120D]">
        {/* Top Chat Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4AF37]/20 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                  VeriBox AI
                </h1>
                <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                  {isOwnerAdmin ? 'Owner · Free Unlimited' : 'Free Unlimited'}
                </span>
              </div>
              <p className="text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                Chat, upload photos, &amp; generate free AI images
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === 'chat' ? 'gallery' : 'chat'))}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'gallery'
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                  : 'border-[#D4AF37]/30 text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Gallery ({gallery.length})</span>
            </button>

            {messages.length > 0 && viewMode === 'chat' && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current = true;
                  setMessages([]);
                  setSending(false);
                  setGlobalError(null);
                  onShowToast('Started a fresh chat');
                }}
                title="Start a new chat"
                className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-[#D4AF37]/25 px-2.5 py-1 text-xs font-bold text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#D5CCB8]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New</span>
              </button>
            )}
          </div>
        </div>

        {/* VIEW A: GALLERY */}
        {viewMode === 'gallery' ? (
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                Saved Free Creations ({gallery.length})
              </p>
              {gallery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setGallery([]);
                    onShowToast('Gallery cleared');
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer dark:text-rose-400"
                >
                  Clear All
                </button>
              )}
            </div>

            {gallery.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/30 py-14 text-center px-4">
                <ImageIcon className="h-8 w-8 text-[#D4AF37] mb-2.5" />
                <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  No generated images yet
                </p>
                <p className="mt-1 max-w-xs text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  Ask VeriBox AI to draw or generate any picture in the chat to save it here.
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode('chat')}
                  className="mt-4 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                >
                  Back to Chat
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gallery.map((item) => (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] dark:bg-[#0B0A07]"
                  >
                    <div className="relative aspect-square bg-[#0A0906]">
                      <img
                        src={item.imageDataUrl}
                        alt={item.prompt}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteGalleryItem(item.id)}
                        aria-label="Delete image"
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/70 text-white hover:bg-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-semibold text-[#1A160D] line-clamp-2 dark:text-[#FAF6EC]">
                        {item.prompt}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-[#8A7F6A]">
                          {item.aspectRatio} · {item.provider}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-[11px] font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* VIEW B: CONVERSATIONAL AI BOT CHAT + IMAGE UPLOAD + FREE GENERATOR */
          <div className="flex flex-col">
            {/* Scrollable Messages Feed */}
            <div className="min-h-[340px] max-h-[54dvh] overflow-y-auto px-3.5 py-4 sm:px-5 space-y-3.5 bg-[#FAF7F0]/40 dark:bg-[#0B0A07]/60">
              {messages.length === 0 ? (
                <div className="space-y-4 py-4">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-[#D4AF37]/25 bg-white p-3.5 shadow-sm dark:bg-[#14120D]">
                      <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                        Hello! I&apos;m VeriBox AI
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[#6E6552] dark:text-[#A89F8C]">
                        Chat with me normally, ask anything about VeriBox (emails, numbers, Paystack deposits), upload any photo using the picture icon below, or tell me what image to create for free.
                      </p>
                    </div>
                  </div>

                  <div className="pl-10 space-y-2">
                    <p className="text-[11px] font-bold text-[#8A7F6A] dark:text-[#A89F8C]">
                      Try asking or generating:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STARTER_CHIPS.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => void handleSendMessage(chip.text, chip.mode || 'auto')}
                          className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/25 bg-white px-3 py-2.5 text-left text-xs font-semibold text-[#2C261A] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 cursor-pointer dark:bg-[#14120D] dark:text-[#EAE2CF]"
                        >
                          {chip.mode === 'image' ? (
                            <Wand2 className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                          )}
                          <span className="truncate">{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${
                        isUser ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                          isUser
                            ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                            : 'border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]'
                        }`}
                      >
                        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>

                      <div
                        className={`max-w-[85%] space-y-2.5 rounded-2xl px-3.5 py-3 shadow-sm ${
                          isUser
                            ? 'rounded-tr-sm border border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#1A160D] dark:bg-[#D4AF37]/20 dark:text-[#FAF6EC]'
                            : 'rounded-tl-sm border border-[#D4AF37]/25 bg-white text-[#1A160D] dark:bg-[#14120D] dark:text-[#FAF6EC]'
                        }`}
                      >
                        {msg.uploadedImageUrl && (
                          <div className="overflow-hidden rounded-xl border border-[#D4AF37]/30 bg-black/40">
                            <img
                              src={msg.uploadedImageUrl}
                              alt="Uploaded attachment"
                              className="max-h-56 w-auto object-contain"
                            />
                          </div>
                        )}

                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>

                        {msg.generatingImage && (
                          <div className="flex items-center gap-2.5 rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3 py-2.5 text-xs dark:bg-[#0B0A07]">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D4AF37]" />
                            <span className="font-semibold text-[#8A6208] dark:text-[#F5D77A]">
                              {msg.queueStatus || 'Generating free artwork...'}
                            </span>
                          </div>
                        )}

                        {msg.generatedImage && (
                          <div className="space-y-2.5 pt-1">
                            <div className="overflow-hidden rounded-xl border border-[#D4AF37]/35 bg-[#0A0906]">
                              <img
                                src={msg.generatedImage.imageDataUrl}
                                alt={msg.generatedImage.prompt}
                                className="max-h-80 w-full object-contain"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownload(msg.generatedImage!)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#D4AF37] px-3 py-1 text-[11px] font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                              >
                                <Download className="h-3 w-3" />
                                <span>Download</span>
                              </button>
                              <button
                                type="button"
                                disabled={sending}
                                onClick={() => void handleRegenerateFromMessage(msg.generatedImage!)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D4AF37]/35 px-2.5 py-1 text-[11px] font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 disabled:opacity-50 cursor-pointer dark:text-[#F5D77A]"
                              >
                                <RefreshCw className="h-3 w-3" />
                                <span>Regenerate</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onCopyText(msg.generatedImage!.prompt, 'Prompt copied!')
                                }
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D4AF37]/25 px-2.5 py-1 text-[11px] font-bold text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#D5CCB8]"
                              >
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {msg.error && (
                          <div className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 p-2.5 text-[11px] font-medium text-rose-700 dark:text-rose-200">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
                            <span>{msg.error}</span>
                          </div>
                        )}

                        {!isUser && msg.provider && !msg.generatingImage && (
                          <p className="text-[10px] font-semibold text-[#8A7F6A] dark:text-[#A89F8C]">
                            {msg.provider}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Composer & Controls */}
            <div className="border-t border-[#D4AF37]/20 bg-white p-3 sm:p-4 space-y-2.5 dark:bg-[#14120D]">
              {/* Mode Toggle + Image Options Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-0.5 dark:bg-[#0B0A07]">
                  {(
                    [
                      { id: 'auto', label: 'Auto Smart' },
                      { id: 'chat', label: 'Chat' },
                      { id: 'image', label: 'Create Image' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setChatMode(m.id);
                        if (m.id === 'image') setShowImageOptions(true);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-colors cursor-pointer ${
                        chatMode === m.id
                          ? 'bg-[#D4AF37] text-[#0A0906]'
                          : 'text-[#6E6552] hover:text-[#1A160D] dark:text-[#A89F8C] dark:hover:text-[#FAF6EC]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowImageOptions((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    showImageOptions
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]'
                      : 'border-[#D4AF37]/25 text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]'
                  }`}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>{style} · {aspectRatio}</span>
                </button>
              </div>

              {/* Optional Style & Aspect Ratio Controls */}
              {showImageOptions && (
                <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-3 space-y-2.5 dark:bg-[#0B0A07]">
                  <div>
                    <p className="mb-1 text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Image Style
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStyle(opt.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                            style === opt.id
                              ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                              : 'border-[#D4AF37]/25 bg-white text-[#4F4736] dark:bg-[#14120D] dark:text-[#D5CCB8]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Aspect Ratio
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ASPECT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAspectRatio(opt.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                            aspectRatio === opt.id
                              ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                              : 'border-[#D4AF37]/25 bg-white text-[#4F4736] dark:bg-[#14120D] dark:text-[#D5CCB8]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {globalError && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                  <span>{globalError}</span>
                  <button
                    type="button"
                    onClick={() => setGlobalError(null)}
                    className="shrink-0 text-rose-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Uploaded Photo Attachment Preview */}
              {attachedImageUrl && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#D4AF37]/40 bg-[#FAF7F0] p-2 dark:bg-[#0B0A07]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={attachedImageUrl}
                      alt="Upload preview"
                      className="h-11 w-11 shrink-0 rounded-xl border border-[#D4AF37]/30 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                        {attachedImageName || 'Attached photo'}
                      </p>
                      <p className="text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
                        Ready to send to VeriBox AI
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedImageUrl(null);
                      setAttachedImageName('');
                    }}
                    aria-label="Remove attached photo"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6E6552] hover:bg-rose-500/15 hover:text-rose-500 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Chat Input Bar with Photo Upload & Send */}
              <div className="flex items-end gap-2 rounded-2xl border border-[#D4AF37]/40 bg-[#FAF7F0] p-1.5 focus-within:border-[#D4AF37] dark:bg-[#0B0A07]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleSelectPhoto(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Upload a photo"
                  aria-label="Upload a photo"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/30 bg-white text-[#8A6208] transition-colors hover:bg-[#D4AF37]/15 disabled:opacity-50 cursor-pointer dark:bg-[#14120D] dark:text-[#F5D77A]"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>

                <textarea
                  rows={1}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (globalError) setGlobalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={
                    chatMode === 'image'
                      ? 'Describe the free image to generate...'
                      : attachedImageUrl
                        ? 'Ask about this photo or how to edit it...'
                        : 'Chat with VeriBox AI, upload photo, or ask to draw...'
                  }
                  className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-xs sm:text-sm text-[#1A160D] placeholder:text-[#8A7F6A] focus:outline-none dark:text-[#FAF6EC]"
                />

                <button
                  type="button"
                  disabled={sending || (!inputText.trim() && !attachedImageUrl)}
                  onClick={() => void handleSendMessage()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] text-[#0A0906] shadow-md transition-all hover:bg-[#E5C150] disabled:opacity-45 cursor-pointer"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : chatMode === 'image' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
