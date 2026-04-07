'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import type { ImageAttachment } from '@/lib/types';

interface Props {
  onSend: (text: string, images?: ImageAttachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export default function MessageInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if ((!text.trim() && images.length === 0) || disabled) return;
    // Capture values BEFORE clearing to avoid race conditions
    const currentText = text;
    const currentImages = images.length > 0 ? [...images] : undefined;
    // Clear input immediately (before async send)
    setText('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.value = ''; // Direct DOM clear as safety net
    }
    // Then send with captured values
    onSend(currentText, currentImages);
  }, [text, images, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ImageAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const base64 = await fileToBase64(file);
      newImages.push({
        base64,
        mediaType: file.type,
        name: file.name,
      });
    }
    setImages((prev) => [...prev, ...newImages]);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3
      pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <div key={i} className="relative flex-shrink-0">
              <img
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt={img.name || 'preview'}
                className="h-16 w-16 rounded-lg object-cover border border-gray-300 dark:border-gray-600"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full
                  text-xs flex items-center justify-center hover:bg-red-600"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          className="flex-shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100
            dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          title="Upload image"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          disabled={isStreaming}
          className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600
            bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm
            text-gray-800 dark:text-gray-200
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 max-h-[200px]"
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 p-2.5 rounded-xl bg-red-500 hover:bg-red-600
              text-white transition-colors"
            title="Stop generating"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() && images.length === 0}
            className="flex-shrink-0 p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700
              text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send (Enter)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/xxx;base64, prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
