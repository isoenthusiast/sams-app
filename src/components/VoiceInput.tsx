"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  onResult: (text: string) => void;
  className?: string;
  placeholder?: string;
  value?: string;
}

export function VoiceInput({ onResult, className, placeholder = "Describe the finding…", value }: Props) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let final = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (final) {
        const currentValue = value || "";
        onResult(currentValue ? currentValue + " " + final : final);
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onResult, value]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  };

  if (!supported) return null;

  return (
    <div className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={listening ? stopListening : startListening}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors touch-manipulation ${
          listening
            ? "bg-red-100 text-red-700 border border-red-300 animate-pulse"
            : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
        }`}
        aria-label={listening ? "Stop recording" : "Start voice input"}
        title={listening ? "Tap to stop" : "Tap to speak"}
      >
        {listening ? "🔴 Recording…" : "🎤 Voice"}
      </button>
      {interim && (
        <span className="ml-2 text-xs text-slate-400 italic">{interim}</span>
      )}
    </div>
  );
}
