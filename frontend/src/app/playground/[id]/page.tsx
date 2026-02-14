"use client";

import { use } from "react";
import dynamic from "next/dynamic";

const PlaygroundNeuralCanvas = dynamic(
  () => import("@/components/playground/PlaygroundNeuralCanvas"),
  { ssr: false }
);

export default function PlaygroundByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PlaygroundNeuralCanvas playgroundId={id} />;
}
