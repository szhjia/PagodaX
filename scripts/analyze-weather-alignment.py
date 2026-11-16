import cv2,numpy as np,json
from pathlib import Path
clear=cv2.imread('artwork-source/xian-clear.jpg')
haze=cv2.resize(cv2.imread('artwork-source/xian-haze.jpg'),(2040,1536))
clahe=cv2.createCLAHE(clipLimit=3,tileGridSize=(12,12))
def prepare(image): return clahe.apply(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY))
# Use structural regions; reject the sky and most of the moving tree canopy.
mask=np.zeros((1536,2040),np.uint8)
for x,y,w,h in [(0,820,370,390),(680,1040,350,400),(1450,1200,590,335),(1790,1050,250,160),(350,750,1570,260)]: mask[y:y+h,x:x+w]=255
sift=cv2.SIFT_create(nfeatures=12000,contrastThreshold=.008)
k1,d1=sift.detectAndCompute(prepare(haze),mask);k2,d2=sift.detectAndCompute(prepare(clear),mask)
matches=cv2.BFMatcher().knnMatch(d1,d2,k=2)
good=[m for m,n in matches if m.distance<.68*n.distance]
src=np.float32([k1[m.queryIdx].pt for m in good]);dst=np.float32([k2[m.trainIdx].pt for m in good])
print('matches',len(good))
for name,solver in [('similarity',cv2.estimateAffinePartial2D),('affine',cv2.estimateAffine2D),('homography',cv2.findHomography)]:
 if name=='homography': M,inside=solver(src,dst,cv2.RANSAC,3)
 else: M,inside=solver(src,dst,method=cv2.RANSAC,ransacReprojThreshold=3,maxIters=10000,confidence=.999)
 inside=inside.ravel().astype(bool)
 projected=cv2.perspectiveTransform(src.reshape(-1,1,2),M if name=='homography' else np.vstack([M,[0,0,1]])).reshape(-1,2)
 err=np.linalg.norm(projected-dst,axis=1)
 print(name,inside.sum(),'median',np.median(err[inside]),'p95',np.percentile(err[inside],95),'matrix',M.tolist())
 if name=='affine':
  pairs=[{'source':s.tolist(),'target':t.tolist(),'error':float(error)} for s,t,error in zip(src[inside],dst[inside],err[inside])]
  Path('/private/tmp/pagodax-alignment.json').write_text(json.dumps({'matrix':M.tolist(),'matches':pairs},indent=2))
