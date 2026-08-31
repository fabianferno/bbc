"use client";

/**
 * The schema the agent wrote for itself before it read a word of evidence.
 * Rendered as a legend — the key printed beside a broadcast graphic — rather
 * than as cards: two labelled runs of terms and the two figures they produced.
 */

import { motion } from "framer-motion";
import type { Ontology } from "@/lib/types";
import { SectionLabel } from "./ui";

export function OntologyPanel({
  ontology,
  nodeCount,
  edgeCount,
}: {
  ontology: Ontology | null;
  nodeCount: number;
  edgeCount: number;
}) {
  return (
    <div className="monitor flex h-full flex-col px-4 py-4">
      <SectionLabel>Ontology</SectionLabel>

      {!ontology ? (
        <p className="mt-4 text-[13px] leading-relaxed text-dim">
          Before reading the evidence, the desk writes a schema: the kinds of
          entity worth naming in this story and the relations worth drawing
          between them.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="chyron mb-2 text-faint">Entity types</div>
            <ul className="flex flex-col">
              {ontology.entity_types.map((t, i) => (
                <motion.li
                  key={t}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2.5 border-b border-rule/70 py-1.5 last:border-0"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-monitor"
                    aria-hidden
                  />
                  <span className="truncate text-[13px] text-ink">{t}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div>
            <div className="chyron mb-2 text-faint">Relation types</div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {ontology.relation_types.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.04 }}
                  className="chyron flex items-center gap-2 text-dim"
                >
                  {i > 0 && <span className="h-2.5 w-px bg-rule" aria-hidden />}
                  {t}
                </motion.span>
              ))}
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-4 border-t border-rule pt-4">
        <div>
          <div className="headline numeric text-2xl leading-none text-white">
            {nodeCount}
          </div>
          <div className="chyron mt-1.5 text-faint">Entities</div>
        </div>
        <div>
          <div className="headline numeric text-2xl leading-none text-white">
            {edgeCount}
          </div>
          <div className="chyron mt-1.5 text-faint">Relations</div>
        </div>
      </div>
    </div>
  );
}
