'use client';
import { useAppStore } from '@/store/appStore';
import { Modal, ModalTitle, ModalBody, ModalActions } from '../ui/Modal';
import { todayStr, addDays } from '@/lib/utils';
import { getCfg } from '@/store/appStore';

export function SrsModal() {
  const store = useAppStore();
  const { srs, updateSrs, setPendingSrsKey } = store;
  const cfg = getCfg(store);

  // Find any SRS entry with interval === -1 (proposal signal)
  const proposal = Object.values(srs).find(e => e.interval === -1);

  if (!proposal) return null;

  const handleConfirm = () => {
    const days = cfg.intervals[0];
    updateSrs(proposal.key, {
      interval: 0,
      nextReview: addDays(todayStr(), days),
    });
    setPendingSrsKey(null);
  };

  const handleCancel = () => {
    // Remove the pending entry entirely
    useAppStore.setState(s => {
      const srs = { ...s.srs };
      delete srs[proposal.key];
      return { srs };
    });
    setPendingSrsKey(null);
  };

  return (
    <Modal open onClose={handleCancel} className="!max-w-[380px]">
      <ModalTitle>🧠 Ajouter au SRS ?</ModalTitle>
      <ModalBody>
        Tu as atteint le seuil de précision sur{' '}
        <strong className="text-text">{proposal.name}</strong>{' '}
        ({proposal.catName}).<br /><br />
        Veux-tu ajouter cette range au système de répétition espacée ?
        La prochaine révision sera dans{' '}
        <strong className="text-text">{cfg.intervals[0]} jour{cfg.intervals[0] > 1 ? 's' : ''}</strong>.
      </ModalBody>
      <ModalActions>
        <button
          onClick={handleConfirm}
          className="px-5 py-2 text-xs font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          Oui, ajouter
        </button>
        <button
          onClick={handleCancel}
          className="px-5 py-2 text-xs font-semibold rounded border border-border text-muted hover:text-text transition-colors cursor-pointer"
        >
          Non merci
        </button>
      </ModalActions>
    </Modal>
  );
}
