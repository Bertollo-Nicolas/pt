'use client';
import { useMemo } from 'react';
import { cellType } from '@/lib/poker';

type Suit = '♠' | '♥' | '♦' | '♣';
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const COLORS: Record<Suit, string> = { '♠': '#111827', '♥': '#dc2626', '♦': '#2563eb', '♣': '#16a34a' };

export function RoadmapHandCards({ hand }: { hand: string }) {
  const suits = useMemo<[Suit, Suit]>(() => {
    const first = SUITS[Math.floor(Math.random() * SUITS.length)];
    if (cellType(hand) === 'suited') return [first, first];
    const others = SUITS.filter(suit => suit !== first);
    return [first, others[Math.floor(Math.random() * others.length)]];
  }, [hand]);
  const secondRank = cellType(hand) === 'pair' ? hand[0] : hand[1];
  return <div className="flex gap-3 justify-center my-5"><Card rank={hand[0]} suit={suits[0]}/><Card rank={secondRank} suit={suits[1]}/></div>;
}

function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return <div className="relative w-[92px] h-[126px] sm:w-[108px] sm:h-[148px] rounded-xl border-2 border-gray-300 bg-white shadow-[0_8px_24px_rgba(0,0,0,.38)] p-2.5 flex flex-col" style={{ color: COLORS[suit] }}><span className="text-3xl sm:text-4xl font-black leading-none">{rank}</span><span className="text-2xl sm:text-3xl leading-none mt-1">{suit}</span><span className="absolute right-2.5 bottom-2.5 text-3xl sm:text-4xl font-black leading-none rotate-180">{rank}</span></div>;
}
