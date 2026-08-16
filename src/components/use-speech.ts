"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Spraakherkenning van de browser zelf — geen API-sleutel, geen kosten, en je
// audio verlaat je Mac niet naar ons toe. Werkt in Chrome, Edge en Safari;
// Firefox ondersteunt het niet, daar valt de knop weg en typ je gewoon.

type SpeechResultList = {
  length: number;
  item(index: number): { isFinal: boolean; 0: { transcript: string } };
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Op de server weten we niet of de browser dit kan, dus daar is het antwoord
// "nee" en na hydratie meteen het echte antwoord.
const subscribeNever = () => () => {};
const isSupportedNow = () => getConstructor() !== null;
const isSupportedOnServer = () => false;

export function useSpeech(onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(subscribeNever, isSupportedNow, isSupportedOnServer);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // In een ref, zodat een nieuwe callback de lopende opname niet afbreekt.
  const onFinalRef = useRef(onFinalText);
  useEffect(() => {
    onFinalRef.current = onFinalText;
  });

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Constructor = getConstructor();
    if (!Constructor) return;

    setError(null);
    const recognition = new Constructor();
    recognition.lang = "nl-NL";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else pending += result[0].transcript;
      }
      setInterim(pending);
      if (finalText.trim()) onFinalRef.current(finalText);
    };

    recognition.onerror = (event) => {
      setListening(false);
      setInterim("");
      if (event.error === "not-allowed") {
        setError("Geen toegang tot de microfoon. Sta hem toe in je browserinstellingen.");
      } else if (event.error === "no-speech") {
        setError("Ik hoorde niets. Probeer het opnieuw.");
      } else if (event.error !== "aborted") {
        setError(`Spraakherkenning gaf een fout: ${event.error}`);
      }
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  return { supported, listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) };
}
