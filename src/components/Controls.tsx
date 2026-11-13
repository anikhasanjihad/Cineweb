import type {ReactNode} from 'react';

export const Group = ({title, footer, children}: {title?: string; footer?: string; children: ReactNode}) => (
  <div style={{marginBottom: 26}}>
    {title && <div className="group-title">{title}</div>}
    <div className="group">{children}</div>
    {footer && <div className="group-foot">{footer}</div>}
  </div>
);

export const Cell = ({label, hint, children, onClick, danger}: {label: string; hint?: string; children?: ReactNode; onClick?: () => void; danger?: boolean}) => {
  const body = (
    <>
      <div style={{minWidth: 0}}>
        <div style={{color: danger ? 'var(--accent)' : undefined, fontWeight: 500}}>{label}</div>
        {hint && <div className="muted" style={{fontSize: 12.5, marginTop: 2}}>{hint}</div>}
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>{children}</div>
    </>
  );
  return onClick ? <button className="cell press" style={{width: '100%', textAlign: 'left'}} onClick={onClick}>{body}</button> : <div className="cell">{body}</div>;
};

export const Toggle = ({value, onChange}: {value: boolean; onChange: (v: boolean) => void}) => (
  <button role="switch" aria-checked={value} className={`toggle${value ? ' on' : ''}`} onClick={() => onChange(!value)}><span /></button>
);

export const Pick = <T extends string | number>({value, options, onChange}: {value: T; options: Array<[T, string]>; onChange: (v: T) => void}) => (
  <select className="pick" value={String(value)} onChange={e => { const o = options.find(x => String(x[0]) === e.target.value); if (o) onChange(o[0]); }}>
    {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
  </select>
);

export const Range = ({value, min, max, step, onChange, fmt}: {value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string}) => (
  <>
    <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    <span className="muted" style={{minWidth: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{fmt ? fmt(value) : value}</span>
  </>
);

export const Page = ({title, back, children}: {title: string; back?: () => void; children: ReactNode}) => (
  <div className="page" style={{paddingBottom: 60}}>
    <div style={{padding: '44px 40px 22px', display: 'flex', alignItems: 'center', gap: 14}}>
      {back && <button className="round press" onClick={back} aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg></button>}
      <h1 className="title-xl">{title}</h1>
    </div>
    <div style={{padding: '0 40px', maxWidth: 760}}>{children}</div>
  </div>
);
