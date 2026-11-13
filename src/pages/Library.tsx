import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {getLibrary} from '../lib/storage';
import {Message, PosterCard} from '../components/Parts';

export default function Library() {
  const nav = useNavigate();
  const [items] = useState(getLibrary);
  return (
    <div className="page">
      <div style={{padding: '48px 40px 20px'}}><h1 className="title-xl">Library</h1></div>
      {items.length === 0 ? (
        <Message title="Nothing saved yet" text="Tap the bookmark on any title to keep it here." />
      ) : (
        <div className="grid">
          {items.map(i => (
            <PosterCard key={i.providerKey + i.link} post={i} onOpen={() => nav(`/info?p=${encodeURIComponent(i.providerKey)}&link=${encodeURIComponent(i.link)}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
