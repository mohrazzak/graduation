# Landing image credits

All photos are free-licensed; treated (grayscale/darkened/resized) for this site.

| File | Source | Author | License |
| ---- | ------ | ------ | ------- |
| hero.jpg | https://commons.wikimedia.org/wiki/File:2023_Turkey_Earthquake_Damage_4.jpg | VOA (Voice of America) | Public domain |
| tier-ND.jpg | https://commons.wikimedia.org/wiki/File:Vienna_Apartment_Building_in_Spittelberg_(on_explore_at_October_14,_2025)_-_Flickr_-_Sandor_Somkuti.jpg | Sandor Somkuti | CC BY-SA 4.0 |
| tier-HVD.jpg | https://commons.wikimedia.org/wiki/File:Partially_collapsed_apartment_building,_1994_Northridge_Earthquake.jpg | FEMA News Photo | Public domain |
| tier-TD.jpg | https://commons.wikimedia.org/wiki/File:Building_destroyed_due_to_earthquake.jpg | Voice of America | Public domain |
| tier-SMD.jpg | PHI-Net (PEER, UC Berkeley) Task 5 validation split — a copy of `samples/sample-SMD.jpg` | PEER | see `samples/CREDITS.md` |

One photo per active class, named by class code. Three of these were shot for
the retired NC/PC/GC scale and are only renamed to the class they actually
depict: the intact Vienna block is ND, the partially collapsed Northridge block
is HVD, the flattened building is TD.

⚠ `tier-SMD.jpg` is a STOPGAP. The retired scale had no slight/moderate photo,
so this is the 224x224 PHI-Net demo sample the detector itself grades SMD at
64.2% — truthful, but it upscales ~1.6x and crops in a 360px card, where the
other three are 800px wide. Replace it with a full-resolution slight/moderate
damage photo before the defense. Until then it is at least the right class:
SMD previously reused the partially collapsed HVD photo, which made the landing
scale read as three levels, not four.
