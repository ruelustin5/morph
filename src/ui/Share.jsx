import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Icon, InputGroup, Spinner, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { Avatar } from './People';
import { fmtTime, linkForCode, TARGET } from '../controller';
import { t, tn, tj } from '../i18n';

async function copyText(c, text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); c.toast(done, 'success', { timeout: 1800 }); }
  catch (e) { c.toast(t('Select the code and copy it.'), 'none'); }
}

/** Owner: who can open this project (one code per person). */
export function ShareDialog({ c, projectId, onClose }) {
  useController(c);
  const entry = projectId && (c.projects || []).find((x) => x.id === projectId);
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null); // id of the code just created (highlighted)
  const [armed, setArmed] = useState(null);
  const reload = async () => setInfo(await c.shareInfo(projectId));
  useEffect(() => { if (projectId) { setInfo(null); setName(''); setFresh(null); setArmed(null); reload(); } }, [projectId]);
  // "Joined" appears without reopening the window.
  useEffect(() => {
    if (!projectId) return;
    const tm = setInterval(() => { if (!busy) reload(); }, 5000);
    return () => clearInterval(tm);
  }, [projectId, busy]);
  if (!projectId) return null;
  const title = entry ? entry.title : '';
  const invites = (info && info.invites) || [];
  const create = async (e) => {
    e && e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const inv = await c.createInvite(projectId, name);
      setName('');
      setFresh(inv.id);
      copyText(c, linkForCode(inv.code), t('Link created and copied'));
      await reload();
    } catch (err) {
      c.toast(t('Could not share: ') + ((err && err.message) || err), 'danger');
    }
    setBusy(false);
  };
  const remove = async (inv) => {
    if (armed !== inv.id) { setArmed(inv.id); return; }
    setArmed(null);
    setBusy(true);
    try {
      const r = await c.removeInvite(projectId, inv.id);
      c.toast(r.rekeyed ? t('{name} can’t open it anymore.', { name: inv.name || t('That person') }) : t('Link removed'), 'success');
      await reload();
    } catch (err) { c.toast(t('Could not remove: ') + ((err && err.message) || err), 'danger'); }
    setBusy(false);
  };
  const stop = async () => {
    if (armed !== 'stop') { setArmed('stop'); return; }
    setArmed(null);
    setBusy(true);
    try { await c.stopSharing(projectId); c.toast(t('“{title}” is private again', { title }), 'success'); await reload(); }
    catch (err) { c.toast(t('Could not stop sharing: ') + ((err && err.message) || err), 'danger'); }
    setBusy(false);
  };
  const shared = info && info.shared && invites.length > 0;
  return (
    <Dialog isOpen onClose={onClose} title={<span className="share-title">{tj('Share {title}', { title: <b>{title}</b> })}</span>} icon="people" className="share-dialog">
      <DialogBody>
        <div className={'share-state' + (shared ? ' is-shared' : '')}>
          <Icon icon={shared ? 'people' : 'lock'} size={16} />
          <span>{!info ? '…' : shared ? tn(invites.length, '1 link', '{n} links') : t('Only you')}</span>
        </div>
        {!info && <div className="share-loading"><Spinner size={18} /></div>}
        {info && invites.length > 0 && (
          <ul className="share-list">
            {invites.map((inv) => (
              <li key={inv.id} className={'share-row' + (fresh === inv.id ? ' is-fresh' : '')}>
                <Avatar person={{ name: inv.name || '?', color: '#5f6b7c' }} size={30} />
                <div className="share-who">
                  <div className="share-name">{inv.name || t('Anyone with this link')}</div>
                  <div className={'share-joined' + (inv.joined ? ' is-in' : '')}>
                    {inv.joined ? <><Icon icon="tick" size={10} /> {t('Joined {when}', { when: fmtTime(inv.joined.at) })}</> : t('Not joined yet')}
                  </div>
                </div>
                <Tooltip content={<span className="share-code-tip">{inv.code}</span>} compact placement="top">
                  <Button small intent={fresh === inv.id ? 'primary' : 'none'} icon="link" text={t('Copy link')} className="share-copy"
                    onClick={() => copyText(c, linkForCode(inv.code), t('Link copied'))} />
                </Tooltip>
                <Tooltip content={armed === inv.id ? t('Click again to remove') : t('Remove')} compact placement="left">
                  <Button small minimal icon={armed === inv.id ? 'trash' : 'cross'} intent={armed === inv.id ? 'danger' : 'none'}
                    aria-label={t('Remove {name}', { name: inv.name || t('this link') })} disabled={busy} onClick={() => remove(inv)} />
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        {info && (
          <form className="share-add" onSubmit={create}>
            <InputGroup value={name} placeholder={t('Their name')} maxLength={40} onChange={(e) => setName(e.target.value)} leftIcon="user" disabled={busy} />
            <Button type="submit" intent="primary" icon="link" text={busy ? t('Working…') : t('Create link')} loading={busy} disabled={busy} />
          </form>
        )}
        <p className="share-how muted">
          <Icon icon="info-sign" size={12} />
          {TARGET === 'web'
            ? t('Each link opens this project and lets that person edit it. Remove the person to turn their link off.')
            : t('People also need to be invited to this artifact on claude.ai with “Can edit”.')}
        </p>
      </DialogBody>
      <DialogFooter
        actions={<Button text={t('Done')} onClick={onClose} />}
      >
        {shared && (
          <Button minimal intent="danger" icon={armed === 'stop' ? 'warning-sign' : 'lock'} disabled={busy}
            text={armed === 'stop' ? t('Click again: remove everyone') : t('Stop sharing')} onClick={stop} />
        )}
      </DialogFooter>
    </Dialog>
  );
}

/** Code entry (guests). */
export function JoinForm({ c, onDone, autoFocus = true, large = false }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await c.joinWithCode(code);
    setBusy(false);
    if (r.error) setErr(r.error); else { setCode(''); onDone && onDone(); }
  };
  return (
    <form className={'join-form' + (large ? ' is-large' : '')} onSubmit={submit}>
      <div className="join-row">
        <InputGroup large={large} autoFocus={autoFocus} value={code} placeholder={t('ABCD-EFGH-JKLM')} leftIcon="key" spellCheck={false}
          autoComplete="off" onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }} intent={err ? 'danger' : 'none'}
          className="join-input" aria-label={t('Code')} />
        <Button large={large} type="submit" intent="primary" text={t('Open')} loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12} />
      </div>
      {err && <div className="field-error">{err}</div>}
    </form>
  );
}

/** Full screen for a guest who has not joined anything yet. */
export function JoinScreen({ c }) {
  useController(c);
  const [signing, setSigning] = useState(false);
  const web = typeof window !== 'undefined' ? window.__web : null;
  const ownerSignIn = async () => {
    setSigning(true);
    try {
      const r = await web.signInOwner();
      if (r.owner) window.location.reload();
      else { c.toast(t('This space already belongs to someone else.'), 'warning'); setSigning(false); }
    } catch (e) {
      c.toast(t('Sign-in did not finish: ') + ((e && e.message) || e), 'warning');
      setSigning(false);
    }
  };
  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-mark"><Icon icon={web ? 'link' : 'key'} size={22} /></div>
        <h1>{web ? 'Morph' : c.spaceName()}</h1>
        {c.joinError && <div className="field-error join-err">{c.joinError}</div>}
        {web
          ? <p className="muted">{t('To open a project, you need its secret link. Ask the person who shared it with you.')}</p>
          : <><p className="muted">{t('Enter the code you were given.')}</p><JoinForm c={c} large /></>}
        {web && (
          <div className="join-owner">
            <Button minimal small icon="log-in" loading={signing} onClick={ownerSignIn} text={t('This is my space: sign in')} />
          </div>
        )}
        {web && (
          <a className="join-own" href="https://github.com/ruelustin5/morph#make-your-own-space" target="_blank" rel="noopener noreferrer">
            {t('Want your own space? Make one for free on GitHub')} <Icon icon="share" size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
