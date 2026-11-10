import { useEffect, useRef, useState } from 'react';
import { drawMockProgress, sampleProgress, mockProgressScrollMax, type MockProgress } from '@/lib/creator/mock-progress';
export function ProgressPreview({ data, active = true, onScroll }: {
    data: MockProgress;
    active?: boolean;
    onScroll?: (scroll: number) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const started = useRef<number | null>(null);
    useEffect(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context)
            return;
        let frame = 0;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        if (started.current === null && active)
            started.current = performance.now();
        function draw() {
            cancelAnimationFrame(frame);
            const elapsed = reduced.matches || !active ? 1200 : performance.now() - (started.current ?? performance.now());
            drawMockProgress(context!, data, 1170, 2532, elapsed);
            if (active && !document.hidden && !reduced.matches && elapsed < 1200)
                frame = requestAnimationFrame(draw);
        }
        draw();
        document.addEventListener('visibilitychange', draw);
        reduced.addEventListener('change', draw);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', draw); reduced.removeEventListener('change', draw); };
    }, [data, active]);
    return <canvas ref={canvas} width={1170} height={2532} role="img" aria-label={`Progress dashboard example, overall score ${data.score} out of 10`} className="block w-full" style={{ aspectRatio: '390 / 844' }} onWheel={onScroll ? event => onScroll(data.scroll + event.deltaY) : undefined}/>;
}
export function ProgressDemo({ active }: { active: boolean }) {
  const [scroll, setScroll] = useState(0)
  return <div className="h-[844px] overflow-y-auto overscroll-contain [scrollbar-width:none]" onScroll={event => setScroll(event.currentTarget.scrollTop)}>
    <div style={{ height: 844 + mockProgressScrollMax }}>
      <div className="sticky top-0 h-[844px]"><ProgressPreview data={{ ...sampleProgress, scroll }} active={active} /></div>
    </div>
  </div>
}
