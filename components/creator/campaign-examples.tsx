import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LaunchCampaign } from '@/lib/creator/campaign-launch'
import styles from './launch-campaign-detail.module.css'

export function ExampleCarousel({ campaign }: { campaign: LaunchCampaign }) {
  const headingId = useId()
  const [active, setActive] = useState(0);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const touchStart = useRef<number | null>(null);
  const count = campaign.examples.length;
  function change(index: number) {
    setActive((index + count) % count);
  }
  useEffect(() => {
    for (const frame of frames.current.values())
      frame.contentWindow?.postMessage(
        { type: "pause", "x-tiktok-player": true },
        "https://www.tiktok.com",
      );
  }, [active]);
  return (
    <section
      className={styles.examples}
      aria-labelledby={headingId}
    >
      <div className={styles.sectionHeading}>
        <span className={styles.eyebrow}>A little inspiration</span>
        <h2 id={headingId}>See the format in action.</h2>
      </div>
      <div
        className={styles.carousel}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${campaign.name} examples`}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (
            start !== null &&
            Math.abs(event.changedTouches[0].clientX - start) > 45
          )
            change(active + (event.changedTouches[0].clientX < start ? 1 : -1));
        }}
      >
        {campaign.examples.map((example, index) => {
          let distance = (index - active + count) % count;
          if (distance > count / 2) distance -= count;
          if (Math.abs(distance) > 2) return null;
          const id = example.url.split("/").at(-1);
          const selected = distance === 0;
          return (
            <div
              key={example.url}
              className={styles.videoCard}
              data-active={selected}
              style={
                {
                  "--position": distance,
                  "--depth": Math.abs(distance),
                  zIndex: 3 - Math.abs(distance),
                } as CSSProperties
              }
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${example.label}`}
              aria-hidden={!selected}
              inert={!selected}
            >
              <iframe
                ref={(frame) => {
                  if (frame) frames.current.set(index, frame);
                  else frames.current.delete(index);
                }}
                src={`https://www.tiktok.com/player/v1/${id}?autoplay=0&loop=0&description=0&music_info=0&rel=0`}
                title={`${campaign.name} — ${example.label}`}
                loading="lazy"
                allow="fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                tabIndex={selected ? 0 : -1}
              />
              {!selected ? <span className={styles.videoShade} /> : null}
            </div>
          );
        })}
        <button
          type="button"
          className={`${styles.carouselArrow} ${styles.previous}`}
          aria-label="Previous example"
          onClick={() => change(active - 1)}
        >
          <ChevronLeft size={21} />
        </button>
        <button
          type="button"
          className={`${styles.carouselArrow} ${styles.next}`}
          aria-label="Next example"
          onClick={() => change(active + 1)}
        >
          <ChevronRight size={21} />
        </button>
      </div>
      <div
        className={styles.exampleCaption}
        aria-live="polite"
        aria-atomic="true"
      >
        <a
          href={campaign.examples[active].url}
          target="_blank"
          rel="noreferrer"
        >
          View original post <ArrowRight size={14} />
        </a>
        <h3>{campaign.name}</h3>
        <p>{campaign.description}</p>
      </div>
      <div className={styles.dots} aria-label="Choose an example">
        {campaign.examples.map((example, index) => (
          <button
            key={example.url}
            type="button"
            aria-label={`Show example ${index + 1}: ${example.label}`}
            aria-current={index === active ? "true" : undefined}
            onClick={() => change(index)}
          >
            <span />
          </button>
        ))}
      </div>
    </section>
  );
}
