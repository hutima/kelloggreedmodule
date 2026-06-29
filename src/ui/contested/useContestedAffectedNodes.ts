import { useMemo } from 'react';
import { useEditorStore } from '@/state';
import { getIssueById, getIssuesForPassage, issueAffectedNodeIds } from '@/domain/contested';

const EMPTY: Set<string> = new Set();

/**
 * Node ids to softly mark in the BASE diagram while the alternate-readings panel
 * is open — so the debated word stays highlighted even when the Base reading is
 * selected (no preview). Empty when the panel is closed or the passage has no
 * contested data.
 */
export function useContestedAffectedNodes(): Set<string> {
  const doc = useEditorStore((s) => s.doc);
  const baseDoc = useEditorStore((s) => s.baseDoc ?? s.doc);
  const panelOpen = useEditorStore((s) => s.contested.showAlternateParsePanel);
  const issueId = useEditorStore((s) => s.contested.selectedContestedIssueId);

  return useMemo(() => {
    if (!panelOpen) return EMPTY;
    const issue = (issueId && getIssueById(issueId)) || getIssuesForPassage(baseDoc)[0];
    if (!issue) return EMPTY;
    return issueAffectedNodeIds(issue, doc);
  }, [panelOpen, issueId, baseDoc, doc]);
}
