import { useId } from 'react'
import styles from './overview-bento.module.css'

export function CashStack() {
  const id = useId().replace(/:/g, '')
  return <svg viewBox="0 0 180 160" className={styles.cashStack} aria-hidden="true">
    <defs><linearGradient id={`${id}-note`} x2=".8" y2="1"><stop stopColor="#e1f2c8" /><stop offset=".5" stopColor="#aaca96" /><stop offset="1" stopColor="#71946e" /></linearGradient><linearGradient id={`${id}-clip`} x2="1" y2=".1"><stop stopColor="#556166" /><stop offset=".18" stopColor="#d8e0df" /><stop offset=".4" stopColor="#fff" /><stop offset=".58" stopColor="#7b8a8c" /><stop offset=".8" stopColor="#e4edeb" /><stop offset="1" stopColor="#617173" /></linearGradient></defs>
    <g className={styles.cashNotes} transform="translate(5 22) rotate(-17 85 60)">
      {[12, 8, 4, 0].map(offset => <g key={offset} transform={`translate(0 ${offset})`}><rect x="10" y="20" width="151" height="87" rx="7" fill={`url(#${id}-note)`} stroke="#517654" strokeWidth="1.3" /><rect x="16" y="26" width="139" height="75" rx="4" fill="none" stroke="#557a54" strokeWidth="1" /><path d="M23 36Q39 26 54 36M118 91Q137 99 147 87M21 88Q33 76 45 90" fill="none" stroke="#6d8e61" strokeWidth="2" opacity=".55" /></g>)}
      <ellipse cx="83" cy="63" rx="27" ry="31" fill="#87a67c" stroke="#57794f" /><ellipse cx="83" cy="63" rx="22" ry="27" fill="none" stroke="#b4cd9e" /><path d="M73 80q-6-6 2-11l2-9q-8-6 0-14 5-6 12 0l5 10-5 7 3 7 10 10" fill="#65875c" />
      <text x="23" y="46" fill="#355c3d" fontSize="17" fontFamily="Georgia,serif" fontWeight="bold">100</text><text x="120" y="90" fill="#355c3d" fontSize="17" fontFamily="Georgia,serif" fontWeight="bold">100</text><path d="M23 53h23m-23 4h17m84-17h22m-22 4h18M26 93h25" stroke="#4e744d" strokeWidth="1" />
      <path d="M103 17h18q6 0 6 7v84q0 9-8 9h-16q-8 0-8-9V25q0-8 8-8Z" fill={`url(#${id}-clip)`} stroke="#5c6f70" /><path d="M101 25v79q0 7 9 7h7" fill="none" stroke="#f7ffff" strokeOpacity=".75" strokeWidth="2" />
    </g>
  </svg>
}

export function ReviewClock() {
  const id = useId().replace(/:/g, '')
  return <svg viewBox="0 0 150 150" className={styles.clock} aria-hidden="true"><defs><linearGradient id={`${id}-rim`} x2="1" y2="1"><stop stopColor="#f6fbff" /><stop offset=".45" stopColor="#a8bfff" /><stop offset="1" stopColor="#5372d5" /></linearGradient><radialGradient id={`${id}-dial`} cx=".35" cy=".25" r=".8"><stop stopColor="#fff" /><stop offset="1" stopColor="#d8e5ff" /></radialGradient></defs><circle cx="79" cy="81" r="58" fill="#152974" opacity=".3" /><circle cx="73" cy="71" r="59" fill={`url(#${id}-rim)`} /><circle cx="73" cy="71" r="51" fill={`url(#${id}-dial)`} stroke="#93a9e5" />{Array.from({ length: 12 }, (_, i) => <path key={i} d="M73 29v5" transform={`rotate(${i * 30} 73 71)`} stroke="#8299d2" strokeWidth={i % 3 === 0 ? 2.8 : 1.5} strokeLinecap="round" />)}<path d="M73 71 57 58" stroke="#344f9c" strokeWidth="5" strokeLinecap="round" /><g className={styles.clockHand}><path d="M73 76V40" stroke="#344f9c" strokeWidth="3.5" strokeLinecap="round" /></g><circle cx="73" cy="71" r="4.5" fill="#3657b2" /><path d="M31 45a48 48 0 0 1 67-17" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" /></svg>
}

export function ApprovalStamp() {
  const id = useId().replace(/:/g, '')
  const edge = Array.from({ length: 96 }, (_, i) => {
    const angle = i / 96 * Math.PI * 2
    const radius = 54 + Math.sin(angle * 11) * 2.5 + Math.cos(angle * 7) * 1.6
    return `${i ? 'L' : 'M'}${75 + Math.cos(angle) * radius},${84 + Math.sin(angle) * radius}`
  }).join(' ') + 'Z'
  return <svg viewBox="0 0 160 160" className={styles.approvalStamp} aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-wax`} cx=".32" cy=".2" r=".85"><stop stopColor="#ff7664" /><stop offset=".23" stopColor="#e13a36" /><stop offset=".6" stopColor="#b41623" /><stop offset="1" stopColor="#730b19" /></radialGradient>
      <linearGradient id={`${id}-rim`} x2=".8" y2="1"><stop stopColor="#ffb096" /><stop offset=".3" stopColor="#dd3935" /><stop offset=".7" stopColor="#780b1a" /><stop offset="1" stopColor="#f56858" /></linearGradient>
      <linearGradient id={`${id}-metal`} x2="1" y2="0"><stop stopColor="#674027" /><stop offset=".2" stopColor="#d4a575" /><stop offset=".5" stopColor="#ffe2aa" /><stop offset=".75" stopColor="#bd8c51" /><stop offset="1" stopColor="#654326" /></linearGradient>
      <linearGradient id={`${id}-wood`} x2="1" y2=".2"><stop stopColor="#2d1012" /><stop offset=".42" stopColor="#7e3533" /><stop offset=".65" stopColor="#472021" /><stop offset="1" stopColor="#200e13" /></linearGradient>
      <filter id={`${id}-imprint`} x="-20%" y="-20%" width="140%" height="140%"><feColorMatrix type="luminanceToAlpha" result="height" /><feGaussianBlur in="height" stdDeviation=".35" result="relief" /><feSpecularLighting in="relief" surfaceScale="3" specularConstant=".8" specularExponent="12" lightingColor="#ffad91" result="shine"><feDistantLight azimuth="225" elevation="40" /></feSpecularLighting><feComposite in="shine" in2="height" operator="in" result="clipped" /><feFlood floodColor="#710c1b" result="color" /><feComposite in="color" in2="height" operator="in" result="recess" /><feMerge><feMergeNode in="recess" /><feMergeNode in="clipped" /></feMerge></filter>
    </defs>
    <g className={styles.waxSeal}>
      <path d={edge} fill="#620b17" opacity=".2" transform="translate(3 6)" />
      <path d={edge} fill={`url(#${id}-wax)`} stroke={`url(#${id}-rim)`} strokeWidth="2.5" />
      <circle cx="75" cy="84" r="43" fill="none" stroke="#6e0917" strokeWidth="3" />
      <circle cx="74.5" cy="83" r="41" fill="none" stroke="#f56354" strokeOpacity=".8" strokeWidth="1.5" />
      <image href="/landing/mogging-logo.png" x="41" y="49" width="68" height="68" filter={`url(#${id}-imprint)`} />
      <path d="M32 60a47 47 0 0 1 54-23M109 113l-6 6" fill="none" stroke="#ffc5a8" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <path d="M36 57a43 43 0 0 1 21-14" fill="none" stroke="#ffe4c6" strokeWidth="1.2" strokeLinecap="round" />
    </g>
    <g className={styles.stampTool}>
      <ellipse cx="75" cy="84" rx="47" ry="16" fill="#3a2424" opacity=".25" />
      <path d="M29 69q46-28 92 0v14q-46 29-92 0Z" fill={`url(#${id}-metal)`} stroke="#a37648" />
      <ellipse cx="75" cy="69" rx="46" ry="15" fill={`url(#${id}-metal)`} stroke="#f0c88e" />
      <path d="M64 19q-15-11-11-26h44q4 15-11 26v37H64Z" fill={`url(#${id}-wood)`} stroke="#48191a" />
      <ellipse cx="75" cy="56" rx="16" ry="6" fill={`url(#${id}-metal)`} />
      <path d="M67 19v29" stroke="#bd7461" strokeWidth="2" opacity=".45" />
    </g>
  </svg>
}

export function GoldCoin() {
  return <div className={styles.coinScene} aria-hidden="true"><div className={styles.coinShadow} /><div className={styles.coin}>{Array.from({ length: 9 }, (_, index) => <span key={index} className={styles.coinEdge} style={{ transform: `translateZ(${index * 1.5 - 6}px)` }} />)}<span className={styles.coinFront}><i /></span><span className={styles.coinBack}><i /></span></div><span className={styles.coinSparkle}>✦</span><span className={styles.coinSparkle}>✦</span></div>
}
