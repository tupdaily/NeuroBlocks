"use client";

import dynamic from "next/dynamic";

const PlaygroundNeuralCanvas = dynamic(
  () => import("@/components/playground/PlaygroundNeuralCanvas"),
  { ssr: false }
);

export default function PlaygroundPage() {
  return <PlaygroundNeuralCanvas />;
}
