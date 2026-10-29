import { useEffect, useRef, useState } from 'react';
import { reportInstrumentIsVisible } from '@/lib/creator/report-tour';
import { drawMockProgress, sampleProgress, mockProgressScrollMax, type MockProgress } from '@/lib/creator/mock-progress';
export function ProgressPreview({ data, active = true, onScroll }: {
    data: MockProgress;
    active?: boolean;
    onScroll?: (scroll: number) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const clock = useRef(0);
    const entries = useRef(new Map<string, number>());
    useEffect(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context)
            return;
        let frame = 0;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        let previous = performance.now();
        function draw() {
            cancelAnimationFrame(frame);
            const now = performance.now();
            if (active && !document.hidden) clock.current += Math.min(50, now - previous);
            previous = now;
            const bounds = element!.getBoundingClientRect(), scale = bounds.width / 390;
            const viewportTop = Math.max(104, -bounds.top / scale), viewportBottom = Math.min(734, (window.innerHeight - bounds.top) / scale);
            let entering = false;
            drawMockProgress(context!, data, 1560, 3376, clock.current, (id, top, height) => {
                if (reduced.matches) return 1200;
                if (active && !entries.current.has(id) && reportInstrumentIsVisible(top, height, data.scroll, viewportTop, viewportBottom)) entries.current.set(id, clock.current);
                const started = entries.current.get(id);
                if (started === undefined) return 0;
                const elapsed = clock.current - started;
                if (elapsed < 1200) entering = true;
                return elapsed;
            });
            if (entering && active && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
        }
        draw();
        document.addEventListener('visibilitychange', draw);
        reduced.addEventListener('change', draw);
        window.addEventListener('scroll', draw, { passive: true });
        window.addEventListener('resize', draw);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', draw); reduced.removeEventListener('change', draw); window.removeEventListener('scroll', draw); window.removeEventListener('resize', draw); };
    }, [data, active]);
    return <canvas ref={canvas} width={1560} height={3376} role="img" aria-label={`Progress dashboard example, overall score ${data.score} out of 10`} className="block w-full" style={{ aspectRatio: '390 / 844' }} onWheel={onScroll ? event => onScroll(data.scroll + event.deltaY) : undefined}/>;
}
export function ProgressDemo({ active }: { active: boolean }) {
  const [scroll, setScroll] = useState(0)
  return <div className="h-[844px] overflow-y-auto overscroll-contain [scrollbar-width:none]" onScroll={event => setScroll(event.currentTarget.scrollTop)}>
    <div style={{ height: 844 + mockProgressScrollMax }}>
      <div className="sticky top-0 h-[844px]"><ProgressPreview data={{ ...sampleProgress, scroll }} active={active} /></div>
    </div>
  </div>
}
