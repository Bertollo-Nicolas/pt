'use client';
import dynamic from 'next/dynamic';

const RangeTrainer = dynamic(() => import('@/components/RangeTrainer'), { ssr: false });

export default function Page() {
  return <RangeTrainer />;
}
