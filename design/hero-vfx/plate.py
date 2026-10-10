# Step 1: clean plate — remove the painted lane dashes so we can animate our own.
import cv2, numpy as np
S = 2  # work at 2x (HD plate)
img = cv2.imread('/home/claude/trucksy_project/website/trucksy-truck-hd.jpg').astype(np.float32)
H, W = img.shape[:2]
VX, VY = 1052.6*S, 390*S
L2 = lambda x: (522 - 0.1253*x/S)*S            # road edge line (yellow), x in HD px
B = np.array([(140,470),(148,488),(160,497),(275,497),(300,505),(363,505),(394,519),(425,505),(440,490),(545,474),(564,482),(586,474),(600,462),(610,455)],np.float32)*S
ys, xs = np.mgrid[0:H, 0:W]
below_edge = ys > (522*S - 0.1253*xs) + 6*S
bottom = np.interp(xs, B[:,0], B[:,1], left=0, right=0)
in_truck_x = (xs >= B[0,0]) & (xs <= B[-1,0])
road = below_edge & (~in_truck_x | (ys > bottom + 3*S))
np.save('road_mask.npy', road)
lum = img.mean(axis=2)
bg = cv2.medianBlur(lum.astype(np.uint8), 61).astype(np.float32)
dash = road & ((lum - bg) > 22)
dash = cv2.dilate(dash.astype(np.uint8)*255, np.ones((13,13),np.uint8))
clean = cv2.inpaint(img.astype(np.uint8), dash, 11, cv2.INPAINT_TELEA)
cv2.imwrite('clean.png', clean)
cv2.imwrite('dashmask.png', dash)
print(W,H, dash.sum()//255)
