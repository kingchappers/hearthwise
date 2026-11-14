import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskHistory } from '../TaskHistory';
import { MEMBERS, ME, THEM, renderIn } from './fixtures';

const history = (over: Partial<Parameters<typeof TaskHistory>[0]['history']> = {}) => ({ completions: [], edits: [], ...over });

function renderHistory(value = history()) {
  renderIn(<TaskHistory history={value} roster={MEMBERS} viewerId={ME.userId} />);
}

describe('TaskHistory', () => {
  it('says there is nothing yet', () => {
    renderHistory();
    expect(screen.getByText('Nothing has happened to this yet.')).toBeInTheDocument();
  });

  it('shows who did a cycle, "Also did it" for each further person, and Together', () => {
    renderHistory(history({ completions: [
      { cycleSeq: 2, cycleDueOn: '2026-11-12', together: false, by: [{ userId: ME.userId, at: 1_000 }, { userId: THEM.userId, at: 2_000 }] },
      { cycleSeq: 1, together: true, by: [{ userId: THEM.userId, at: 500 }] },
    ] }));
    expect(screen.getByText('Done by Sam')).toBeInTheDocument();
    expect(screen.getByText('Also did it: Alex')).toBeInTheDocument();
    expect(screen.getByText(/Done by Alex/)).toBeInTheDocument();
    expect(screen.getByText(/Together/)).toBeInTheDocument();
  });

  it('shows the other member\'s direct edits', () => {
    renderHistory(history({ edits: [{ byUserId: THEM.userId, fields: ['title', 'notes'], at: 9_000 }] }));
    expect(screen.getByText(/Alex changed the title and notes/)).toBeInTheDocument();
  });

  it('calls someone who left a Former member', () => {
    renderHistory(history({ completions: [{ cycleSeq: 1, together: false, by: [{ userId: 'gone', at: 1 }] }], edits: [{ byUserId: 'gone', fields: ['title'], at: 2 }] }));
    expect(screen.getByText('Done by Former member')).toBeInTheDocument();
    expect(screen.getByText(/Former member changed the title/)).toBeInTheDocument();
  });
});
