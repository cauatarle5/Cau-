'use client';

import { useQueryClient } from '@tanstack/react-query';
import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ChatMessageDto, ProposalDto } from '@atlas/schemas';

import { coachApi, streamMessage } from '../api';
import { coachKeys, useAiStatus, useConversation, useConversations } from '../hooks';

import { ProposalCard } from './proposal-card';
import { RichText } from './rich-text';

const SUGGESTIONS = [
  'Como foi minha semana?',
  'Como está minha ingestão de proteína?',
  'Qual treino devo fazer hoje?',
  'Quais padrões aparecem nos meus dados?',
];

interface Streaming {
  question: string;
  text: string;
  tool: string | null;
  proposals: ProposalDto[];
  notice: string | null;
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'max-w-[90%] space-y-2 rounded-2xl px-4 py-3 text-sm',
        role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
      )}
    >
      {children}
    </li>
  );
}

function Message({ m }: { m: ChatMessageDto }) {
  return (
    <Bubble role={m.role}>
      {m.role === 'assistant' ? (
        <RichText text={m.text} />
      ) : (
        <p className="whitespace-pre-wrap">{m.text}</p>
      )}
      {m.proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </Bubble>
  );
}

/** Chat do Coach (P10.2/P12.1): conversas persistidas, resposta em streaming e propostas. */
export function CoachChat() {
  const qc = useQueryClient();
  const status = useAiStatus();
  const conversations = useConversations();
  // `null` = a mais recente; 'new' = conversa nova ainda não criada.
  const [chosen, setChosen] = useState<string | null>(null);
  const currentId = chosen === 'new' ? null : (chosen ?? conversations.data?.items[0]?.id ?? null);
  const setCurrentId = (id: string | null) => {
    setChosen(id ?? 'new');
  };
  const conversation = useConversation(currentId);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [streaming?.text, conversation.data?.messages.length]);

  const available = status.data?.available ?? true;

  async function send(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    setError(null);
    setText('');
    let id = currentId;
    try {
      if (!id) {
        id = (await coachApi.createConversation()).id;
        setCurrentId(id);
      }
      setStreaming({ question: q, text: '', tool: null, proposals: [], notice: null });
      const outcome: { failed: string | null } = { failed: null };
      await streamMessage(id, q, (e) => {
        if (e.type === 'error') outcome.failed = e.message;
        setStreaming((s) => {
          if (!s) return s;
          switch (e.type) {
            case 'text':
              return { ...s, text: s.text + e.delta, tool: null };
            case 'tool':
              return { ...s, tool: e.label };
            case 'proposal':
              return { ...s, proposals: [...s.proposals, e.proposal] };
            case 'notice':
              return { ...s, notice: e.message };
            case 'error':
              return s;
            case 'done':
              return s;
          }
        });
      });
      if (outcome.failed !== null) {
        setError(outcome.failed);
        setText(q);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível falar com o Coach.');
      setText(q);
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: coachKeys.conversation(id ?? '') }),
        qc.invalidateQueries({ queryKey: coachKeys.list }),
        qc.invalidateQueries({ queryKey: coachKeys.status }),
      ]);
      setStreaming(null);
    }
  }

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    void send(text);
  };

  const messages = currentId ? (conversation.data?.messages ?? []) : [];
  const empty = messages.length === 0 && !streaming;

  return (
    <div className="space-y-3">
      {!available ? (
        <Card role="status">
          <CardDescription>
            O Coach está indisponível agora (IA não configurada). O restante do Atlas funciona
            normalmente.
          </CardDescription>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        {(conversations.data?.items.length ?? 0) > 0 ? (
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="conversation">Conversa</Label>
            <select
              id="conversation"
              className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
              value={currentId ?? ''}
              disabled={streaming !== null}
              onChange={(e) => {
                setCurrentId(e.target.value || null);
              }}
            >
              {conversations.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button
          variant="outline"
          disabled={streaming !== null}
          onClick={() => {
            setCurrentId(null);
            setError(null);
          }}
        >
          Nova conversa
        </Button>
      </div>

      <ol aria-label="Mensagens" className="flex flex-col gap-3">
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {streaming ? (
          <>
            <Bubble role="user">
              <p className="whitespace-pre-wrap">{streaming.question}</p>
            </Bubble>
            <Bubble role="assistant">
              {streaming.text ? <RichText text={streaming.text} /> : null}
              {streaming.tool ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {streaming.tool}…
                </p>
              ) : !streaming.text ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Pensando…
                </p>
              ) : null}
              {streaming.notice ? <p className="text-xs">{streaming.notice}</p> : null}
              {streaming.proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </Bubble>
          </>
        ) : null}
      </ol>
      <div ref={endRef} />
      <p role="status" className="sr-only">
        {streaming ? 'O Coach está respondendo' : ''}
      </p>

      {empty && available ? (
        <ul aria-label="Sugestões" className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="min-h-11 rounded-full border border-border bg-card px-3 text-sm hover:bg-muted"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="sticky bottom-20 flex gap-2 bg-background py-2 lg:bottom-0"
      >
        <label htmlFor="coach-input" className="sr-only">
          Pergunte ao Coach
        </label>
        <textarea
          id="coach-input"
          rows={1}
          value={text}
          disabled={!available || streaming !== null}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder="Pergunte sobre treino, alimentação ou progresso"
          className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
        />
        <Button
          type="submit"
          aria-label="Enviar"
          disabled={!available || streaming !== null || !text.trim()}
        >
          <SendHorizontal className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
