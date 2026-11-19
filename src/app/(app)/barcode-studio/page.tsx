import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import type { LabelTemplateId } from "@/lib/barcode";

import { BarcodeStudioClient } from "./barcode-studio-client";
import { loadBarcodeStudioRecords } from "./queries";

export const metadata: Metadata = {
  title: "Barcode & Label Print Studio",
};

type ResolvedSearchParams = {
  item?: string | string[];
  archive?: string | string[];
  code?: string | string[];
  template?: string | string[];
  source?: string | string[];
};

type SearchParamsInput = Promise<ResolvedSearchParams>;

function firstParam(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

function parseTemplateParam(val: string | undefined): LabelTemplateId | undefined {
  if (val === "THERMAL" || val === "A4_GRID" || val === "ARCHIVE_SPINE") {
    return val;
  }
  return undefined;
}

export default async function BarcodeStudioPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireRouteAccess("/barcode-studio");

  const [resolvedParams, data] = await Promise.all([
    searchParams ?? Promise.resolve<ResolvedSearchParams>({}),
    loadBarcodeStudioRecords(),
  ]);

  const itemParam = firstParam(resolvedParams.item);
  const archiveParam = firstParam(resolvedParams.archive);
  const codeParam = firstParam(resolvedParams.code)?.trim().toUpperCase();
  const templateParam = parseTemplateParam(firstParam(resolvedParams.template));
  const sourceParam = firstParam(resolvedParams.source)?.toUpperCase();

  const initialSelectedKeys: string[] = [];
  if (itemParam) {
    initialSelectedKeys.push(`item:${itemParam}`);
  }
  if (archiveParam) {
    initialSelectedKeys.push(`archive:${archiveParam}`);
  }
  if (codeParam) {
    const matched = [...data.items, ...data.archives].find(
      (r) => r.code.toUpperCase() === codeParam,
    );
    if (matched && !initialSelectedKeys.includes(matched.key)) {
      initialSelectedKeys.push(matched.key);
    }
  }

  const initialSourceTab =
    sourceParam === "ARCHIVE" || (archiveParam && !itemParam)
      ? "ARCHIVE"
      : sourceParam === "INVENTORY" || (itemParam && !archiveParam)
        ? "INVENTORY"
        : "ALL";

  const initialTemplate: LabelTemplateId =
    templateParam ?? (archiveParam && !itemParam ? "ARCHIVE_SPINE" : "THERMAL");

  return (
    <BarcodeStudioClient
      schemaReady={data.schemaReady}
      schemaError={data.schemaError}
      items={data.items}
      archives={data.archives}
      initialSelectedKeys={initialSelectedKeys}
      initialSourceTab={initialSourceTab}
      initialTemplate={initialTemplate}
    />
  );
}
