"""Threat scoring, level classification and per-threat alert cooldown."""
import time

from . import config

# Threat types that count towards the "+10 per additional distinct threat" rule.
SCORED_TYPES = ("fire", "gun", "knife", "fight", "blood", "smoke")


def level_for(score):
    if score >= config.LEVEL_HIGH_MIN:
        return "High Danger"
    if score >= config.LEVEL_MEDIUM_MIN:
        return "Medium Danger"
    return "Safe"


def compute_score(threats, fight_prob=0.0, person_with_weapon=False):
    """
    threats: set of active threat types (subset of SCORED_TYPES, may also contain
    'suspicious_activity' which is a tag only and never scored on its own).
    Returns (score, per_type_scores).
    """
    per = {}
    if "fire" in threats:
        per["fire"] = config.SCORE_FIRE
    if "gun" in threats:
        per["gun"] = config.SCORE_GUN
    if "knife" in threats:
        per["knife"] = config.SCORE_KNIFE
    if "fight" in threats:
        p = min(max(fight_prob, config.FIGHT_PROB_THRESHOLD), 1.0)
        per["fight"] = config.SCORE_FIGHT_BASE + config.SCORE_FIGHT_RANGE * (
            (p - config.FIGHT_PROB_THRESHOLD) / (1.0 - config.FIGHT_PROB_THRESHOLD)
        )
    if "blood" in threats:
        per["blood"] = config.SCORE_BLOOD
    # Smoke on its own is a separate (lower) threat; alongside fire it is part of the same event.
    if "smoke" in threats and "fire" not in threats:
        per["smoke"] = config.SCORE_SMOKE

    if person_with_weapon:
        for w in ("gun", "knife"):
            if w in per:
                per[w] += config.BONUS_PERSON_WITH_WEAPON

    if not per:
        return 0, per
    score = max(per.values()) + config.BONUS_PER_EXTRA_THREAT * (len(per) - 1)
    return int(round(min(100, score))), {k: int(round(v)) for k, v in per.items()}


class AlertGate:
    """Decides whether a scored frame should raise an alert, honouring a per-type cooldown."""

    def __init__(self):
        self.threshold = config.ALERT_THRESHOLD
        self.cooldown = config.COOLDOWN_SECONDS
        self.last_sent = {}

    def update_settings(self, threshold=None, cooldown=None):
        if threshold is not None:
            self.threshold = int(threshold)
        if cooldown is not None:
            self.cooldown = int(cooldown)

    def should_alert(self, score, threat_types):
        if score < self.threshold or not threat_types:
            return False
        now = time.time()
        fresh = [t for t in threat_types if now - self.last_sent.get(t, 0) >= self.cooldown]
        if not fresh:
            return False
        # Any new type re-arms the cooldown for every type in this alert.
        for t in threat_types:
            self.last_sent[t] = now
        return True
