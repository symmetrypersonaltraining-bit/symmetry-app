'use client';
import { useState } from 'react';

const CATEGORIES = ['Bug', 'UI change', 'New feature', 'Content', 'Other'];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState('Bug');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSent(true);
    setTimeout(() => { setOpen(false); setSent(false); setText(''); }, 1500);
  };

  return (
    <>
      <button className="fab-feedback" onClick={() => setOpen(true)} title="Log app update note">✏️</button>
      {open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'flex-end'}}
             onClick={(e: React.MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && setOpen(false)}>
          <div style={{background:'var(--brand-surface)',borderRadius:'18px 18px 0 0',width:'100%',padding:16,maxHeight:'60vh'}}>
            <div style={{width:36,height:4,background:'var(--brand-border)',borderRadius:2,margin:'0 auto 14px'}}/>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2,color:'var(--brand-text)'}}>📝 App Update Note</div>
            <div style={{fontSize:11,color:'var(--brand-text-secondary)',marginBottom:12}}>
              Logged with page context automatically
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {CATEGORIES.map(c => (
                <div key={c} onClick={() => setCat(c)}
                  style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:500,cursor:'pointer',
                    background: cat===c ? 'var(--brand-primary)' : 'transparent',
                    color: cat===c ? 'white' : 'var(--brand-text-secondary)',
                    border: `1px solid ${cat===c ? 'var(--brand-primary)' : 'var(--brand-border)'}`}}>
                  {c}
                </div>
              ))}
            </div>
            <textarea value={text} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
              style={{width:'100%',padding:'9px 10px',borderRadius:10,border:'1px solid var(--brand-border)',
                background:'var(--brand-bg)',color:'var(--brand-text)',fontSize:12,fontFamily:'inherit',resize:'none',boxSizing:'border-box'}}
              rows={3} placeholder="Describe the issue or change needed..."/>
            {sent ? (
              <div style={{textAlign:'center',color:'#22c55e',fontWeight:600,marginTop:10}}>✓ Sent!</div>
            ) : (
              <button onClick={send}
                style={{width:'100%',marginTop:10,background:'var(--brand-primary)',color:'white',border:'none',
                  padding:11,borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Send note
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
