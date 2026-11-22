import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Icon, InputGroup, Spinner, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { Avatar } from './People';
import { fmtTime, linkForCode, TARGET } from '../controller';

async function copyText(c, text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); c.toast(done, 'success', { timeout: 1800 }); }
  catch (e) { c.toast('Select the code and copy it.', 'none'); }
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
    const t = setInterval(() => { if (!busy) reload(); }, 5000);
    return () => clearInterval(t);
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
      copyText(c, linkForCode(inv.code), 'Link created and copied');
      await reload();
    } catch (err) {
      c.toast('Could not share: ' + ((err && err.message) || err), 'danger');
    }
    setBusy(false);
  };
  const remove = async (inv) => {
    if (armed !== inv.id) { setArmed(inv.id); return; }
    setArmed(null);
    setBusy(true);
    try {
      const r = await c.removeInvite(projectId, inv.id);
      c.toast(r.rekeyed ? `${inv.name || 'That person'} can’t open it anymore.` : 'Link removed', 'success');
      await reload();
    } catch (err) { c.toast('Could not remove: ' + ((err && err.message) || err), 'danger'); }
    setBusy(false);
  };
  const stop = async () => {
    if (armed !== 'stop') { setArmed('stop'); return; }
    setArmed(null);
    setBusy(true);
    try { await c.stopSharing(projectId); c.toast(`“${title}” is private again`, 'success'); await reload(); }
    catch (err) { c.toast('Could not stop sharing: ' + ((err && err.message) || err), 'danger'); }
    setBusy(false);
  };
  const shared = info && info.shared && invites.length > 0;
  return (
    <Dialog isOpen onClose={onClose} title={<span className="share-title">Share <b>{title}</b></span>} icon="people" className="share-dialog">
      <DialogBody>
        <div className={'share-state' + (shared ? ' is-shared' : '')}>
          <Icon icon={shared ? 'people' : 'lock'} size={16} />
          <span>{!info ? '…' : shared ? `${invites.length} link${invites.length > 1 ? 's' : ''}` : 'Only you'}</span>
        </div>
        {!info && <div className="share-loading"><Spinner size={18} /></div>}
        {info && invites.length > 0 && (
          <ul className="share-list">
            {invites.map((inv) => (
              <li key={inv.id} className={'share-row' + (fresh === inv.id ? ' is-fresh' : '')}>
                <Avatar person={{ name: inv.name || '?', color: '#5f6b7c' }} size={30} />
                <div className="share-who">
                  <div className="share-name">{inv.name || 'Anyone with this link'}</div>
                  <div className={'share-joined' + (inv.joined ? ' is-in' : '')}>
                    {inv.joined ? <><Icon icon="tick" size={10} /> Joined {fmtTime(inv.joined.at)}</> : 'Not joined yet'}
                  </div>
                </div>
                <Tooltip content={<span className="share-code-tip">{inv.code}</span>} compact placement="top">
                  <Button small intent={fresh === inv.id ? 'primary' : 'none'} icon="link" text="Copy link" className="share-copy"
                    onClick={() => copyText(c, linkForCode(inv.code), 'Link copied')} />
                </Tooltip>
                <Tooltip content={armed === inv.id ? 'Click again to remove' : 'Remove'} compact placement="left">
                  <Button small minimal icon={armed === inv.id ? 'trash' : 'cross'} intent={armed === inv.id ? 'danger' : 'none'}
                    aria-label={`Remove ${inv.name || 'code'}`} disabled={busy} onClick={() => remove(inv)} />
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        {info && (
          <form className="share-add" onSubmit={create}>
            <InputGroup value={name} placeholder="Their name" maxLength={40} onChange={(e) => setName(e.target.value)} leftIcon="user" disabled={busy} />
            <Button type="submit" intent="primary" icon="link" text={busy ? 'Working…' : 'Create link'} loading={busy} disabled={busy} />
          </form>
        )}
        <p className="share-how muted">
          <Icon icon="info-sign" size={12} />
          {TARGET === 'web'
            ? 'Each link opens this project and lets that person edit it. Remove the person to turn their link off.'
            : 'People also need to be invited to this artifact on claude.ai with “Can edit”.'}
        </p>
      </DialogBody>
      <DialogFooter
        actions={<Button text="Done" onClick={onClose} />}
      >
        {shared && (
          <Button minimal intent="danger" icon={armed === 'stop' ? 'warning-sign' : 'lock'} disabled={busy}
            text={armed === 'stop' ? 'Click again: remove everyone' : 'Stop sharing'} onClick={stop} />
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
        <InputGroup large={large} autoFocus={autoFocus} value={code} placeholder="ABCD-EFGH-JKLM" leftIcon="key" spellCheck={false}
          autoComplete="off" onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }} intent={err ? 'danger' : 'none'}
          className="join-input" aria-label="Code" />
        <Button large={large} type="submit" intent="primary" text="Open" loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12} />
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
      else { c.toast('This space already belongs to someone else.', 'warning'); setSigning(false); }
    } catch (e) {
      c.toast('Sign-in did not finish: ' + ((e && e.message) || e), 'warning');
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
          ? <p className="muted">To open a project, you need its secret link. Ask the person who shared it with you.</p>
          : <><p className="muted">Enter the code you were given.</p><JoinForm c={c} large /></>}
        {web && (
          <div className="join-owner">
            <Button minimal small icon="log-in" loading={signing} onClick={ownerSignIn} text="This is my space: sign in" />
          </div>
        )}
      </div>
    </div>
  );
}
