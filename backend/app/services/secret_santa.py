import random
from typing import List, Dict, Tuple, Optional

def solve_secret_santa(
    participants: List[Dict], # list of {"id": int/str, "name": str}
    exclusions: Optional[Dict[str, List[str]]] = None # {giver_id: [excluded_receiver_id]}
) -> List[Tuple[Dict, Dict]]:
    """
    Computes a valid Secret Santa derangement meeting all exclusion constraints.
    Returns list of (giver_dict, receiver_dict).
    """
    if len(participants) < 2:
        raise ValueError("Secret Santa requires at least 2 participants.")

    exclusions = exclusions or {}
    givers = list(participants)
    receivers = list(participants)

    # Try up to 200 random permutations with back-tracking restart
    for _ in range(200):
        random.shuffle(receivers)
        valid = True
        pairs = []
        for giver, receiver in zip(givers, receivers):
            gid = str(giver["id"])
            rid = str(receiver["id"])
            # Cannot draw self
            if gid == rid:
                valid = False
                break
            # Cannot draw excluded person
            if rid in exclusions.get(gid, []):
                valid = False
                break
            pairs.append((giver, receiver))
        if valid:
            return pairs

    raise ValueError("Could not find a valid Secret Santa assignment with these exclusion rules. Try relaxing exclusions.")
