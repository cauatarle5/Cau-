'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SPORT_LABELS } from '@/features/profile/labels';
import { addDays } from '@atlas/core';
import { sportCodeSchema } from '@atlas/schemas';

import { useCreateActivity } from '../hooks';
import { DEMAND_LABELS } from '../labels';

/** Registro de esporte/cardio (P8.5): entra na carga e na adaptação do dia seguinte. */
export function ActivityForm({ today }: { today: string }) {
  const create = useCreateActivity();
  const [sport, setSport] = useState<(typeof sportCodeSchema.options)[number]>('football');
  const [when, setWhen] = useState<'today' | 'yesterday'>('today');
  const [minutes, setMinutes] = useState('60');
  const [rpe, setRpe] = useState(7);
  const [demand, setDemand] = useState<1 | 2 | 3>(3);
  const [message, setMessage] = useState<string>();

  return (
    <Card className="space-y-3" role="region" aria-label="Registrar atividade">
      <div className="space-y-1">
        <CardTitle>Registrar atividade</CardTitle>
        <CardDescription>
          Futebol, corrida e outros esportes entram na carga e ajustam o treino.
        </CardDescription>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="activity-sport">Esporte</Label>
          <Select
            id="activity-sport"
            value={sport}
            onChange={(e) => {
              setSport(sportCodeSchema.parse(e.target.value));
            }}
          >
            {sportCodeSchema.options.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-when">Quando</Label>
          <Select
            id="activity-when"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value === 'yesterday' ? 'yesterday' : 'today');
            }}
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-minutes">Duração (min)</Label>
          <Input
            id="activity-minutes"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-demand">Exigência nas pernas</Label>
          <Select
            id="activity-demand"
            value={String(demand)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDemand(v === 1 ? 1 : v === 2 ? 2 : 3);
            }}
          >
            {([1, 2, 3] as const).map((d) => (
              <option key={d} value={d}>
                {DEMAND_LABELS[d]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Intensidade (RPE 1–10)</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Intensidade da atividade">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={rpe === v}
              className={`size-10 rounded-md border border-border text-sm ${rpe === v ? 'border-primary bg-primary text-primary-foreground' : ''}`}
              onClick={() => {
                setRpe(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <Button
        disabled={create.isPending || !(Number(minutes) > 0)}
        onClick={() => {
          create.mutate(
            {
              date: when === 'today' ? today : addDays(today, -1),
              sportCode: sport,
              durationMin: Number(minutes),
              intensityRpe: rpe,
              lowerBodyDemand: demand,
            },
            { onSuccess: () => { setMessage(`${SPORT_LABELS[sport]} registrado.`); } },
          );
        }}
      >
        Salvar atividade
      </Button>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
