# syntax=docker/dockerfile:1
FROM node:16-alpine
RUN apk update && apk add git
ADD https://api.github.com/repos/kgpmask/MASK/git/refs/heads/main version.json
RUN git clone https://github.com/kgpmask/MASK.git --depth 1 --single-branch --branch main MASK
WORKDIR /MASK
COPY src/admin-credentials.json src/credentials.json
RUN npm install
ENV SITE_URL='https://kgpmask.club'
CMD ["npm", "start", "prod"]
EXPOSE 6969
