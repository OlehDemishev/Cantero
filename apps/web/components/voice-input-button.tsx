"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MicIcon } from "@/components/nav-icons";

// The Web Speech API's SpeechRecognition isn't in TypeScript's lib.dom yet — the constructor
// lives under a vendor prefix on every browser that ships it (Chrome/Edge/Safari on iOS/Android).
interface MinimalSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * A mic button that appends live-transcribed speech into a text field — entirely client-side via
 * the browser's Web Speech API, no audio ever leaves the device and no server-side transcription
 * service is involved. Renders nothing where the browser doesn't support it (most desktop Firefox,
 * desktop Safari) rather than showing a button that would just fail.
 */
export function VoiceInputButton({ onTranscript, locale }: { onTranscript: (text: string) => void; locale?: string }) {
  const t = useTranslations("field");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    if (locale) recognition.lang = locale;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) finalText += event.results[i][0].transcript;
      if (finalText.trim()) onTranscript(finalText.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(listening ? "voiceInputStop" : "voiceInputStart")}
      title={t(listening ? "voiceInputStop" : "voiceInputStart")}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        listening ? "animate-pulse bg-error-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      <MicIcon width={14} height={14} />
    </button>
  );
}
